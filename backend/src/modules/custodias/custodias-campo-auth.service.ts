import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashear, normalizarCodigo } from '../bitacora/bitacora-extension.util';
import { personasDelViaje } from './custodias-dispositivos.service';
import {
  HASH_PIN_FALSO,
  type RolViaje,
  esPinValido,
  generarTokenCelular,
  generarTokenSesion,
  hashearToken,
  normalizarCedula,
  verificarPin,
} from './custodias-campo-seguridad.util';

/** El celular de la empresa que llama, ya identificado por su token. */
export interface CelularAutenticado {
  id: number;
  companyId: number;
  nombre: string;
}

/** La persona que entró en ese celular, sobre el viaje asignado. */
export interface SesionAutenticada {
  id: number;
  custodiaId: number;
  companyId: number;
  dispositivoId: number;
  cedula: string;
  nombre: string;
  rol: RolViaje;
}

const MENSAJE_CELULAR = 'Este celular ya no está vinculado. Pide un código nuevo a Operaciones.';
const MENSAJE_SESION = 'Tu sesión terminó. Entra de nuevo con tu cédula y tu PIN.';
const MENSAJE_PIN_MALO = 'Cédula o PIN incorrectos';
const MENSAJE_BLOQUEO = 'Demasiados intentos. Espera 15 minutos o pide ayuda a Operaciones';
const FALLOS_PARA_BLOQUEO = 5;
const ULTIMO_USO_CADA_MS = 60_000;
/** Una sesión vive mientras dure el viaje; este tope evita sesiones eternas en un celular perdido. */
const VIDA_SESION_DIAS = 3;
/** Un viaje terminado sigue verse en el celular (solo lectura) este tiempo. */
export const HORAS_SOLO_LECTURA = 12;

/** Lo mínimo del viaje que el celular necesita saber para elegir cuál es el suyo. */
export interface ViajeDelCelular {
  id: number;
  companyId: number;
  numeroGuia: string;
  tipoCustodia: string;
  estado: string;
  cliente: string;
}

/**
 * Autenticación de la página de campo (2026-11-24, Fase 2): vincular el celular con un código de un solo uso, el
 * token del celular (cd_…) y la sesión de cada persona (cs_…, PIN de 4 dígitos). Todo se guarda con hash.
 */
@Injectable()
export class CustodiasCampoAuthService {
  private readonly logger = new Logger(CustodiasCampoAuthService.name);
  private readonly ultimoUsoAnotado = new Map<number, number>();

  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── Celular ─────────────────────────────

  /** Cambia el código por el token del celular. El código sirve una sola vez, aunque lleguen dos peticiones a la vez. */
  async vincular(codigoCrudo: unknown): Promise<{ token: string; nombre: string }> {
    const codigo = normalizarCodigo(codigoCrudo);
    const filas = codigo
      ? await this.prisma.$queryRaw<
          { companyId: number; nombre: string; creadoPor: number | null; dispositivoId: number | null }[]
        >`
          DELETE FROM "CustodiaDispositivoCodigo"
          WHERE "codigoHash" = ${hashear(codigo)} AND "expiraEn" > now()
          RETURNING "companyId", "nombre", "creadoPor", "dispositivoId"`
      : [];
    const fila = filas[0];
    if (!fila) {
      throw new BadRequestException('El código no es válido o ya venció. Pide uno nuevo a Operaciones.');
    }
    const token = generarTokenCelular();
    // «Vincular de nuevo»: el código es de un celular que ya existe; se reactiva ese mismo registro (los viajes viejos
    // siguen apuntando a él) con un token nuevo, y el token anterior deja de valer.
    if (fila.dispositivoId) {
      const reactivados = await this.prisma.$queryRaw<{ nombre: string }[]>`
        UPDATE "CustodiaDispositivo"
        SET "tokenHash" = ${hashearToken(token)}, "revocadoEn" = NULL, "archivadoEn" = NULL,
            "intentosFallidos" = 0, "bloqueadoHasta" = NULL
        WHERE "id" = ${fila.dispositivoId} AND "companyId" = ${fila.companyId}
        RETURNING "nombre"`;
      if (reactivados[0]) return { token, nombre: reactivados[0].nombre };
      // Si el celular ya no existe (no debería pasar), se crea uno nuevo con ese nombre.
    }
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaDispositivo" ("companyId", "nombre", "tokenHash", "creadoPor")
      VALUES (${fila.companyId}, ${fila.nombre}, ${hashearToken(token)}, ${fila.creadoPor})`;
    return { token, nombre: fila.nombre };
  }

  /** null si el token no existe o el celular fue desvinculado. */
  async autenticarCelular(token: string): Promise<CelularAutenticado | null> {
    const filas = await this.prisma.$queryRaw<{ id: number; companyId: number; nombre: string }[]>`
      SELECT "id", "companyId", "nombre" FROM "CustodiaDispositivo"
      WHERE "tokenHash" = ${hashearToken(token)} AND "revocadoEn" IS NULL`;
    const f = filas[0];
    if (!f) return null;
    this.anotarUso(f.id);
    return { id: f.id, companyId: f.companyId, nombre: f.nombre };
  }

  mensajeCelularInvalido(): UnauthorizedException {
    return new UnauthorizedException(MENSAJE_CELULAR);
  }

  // Para no escribir en cada petición: como mucho una vez por minuto por celular.
  private anotarUso(id: number) {
    const ahora = Date.now();
    if (ahora - (this.ultimoUsoAnotado.get(id) ?? 0) < ULTIMO_USO_CADA_MS) return;
    this.ultimoUsoAnotado.set(id, ahora);
    this.prisma
      .$executeRaw`UPDATE "CustodiaDispositivo" SET "ultimoUso" = now() WHERE "id" = ${id}`
      .catch((err) => this.logger.warn(`No se pudo anotar el uso del celular ${id}: ${(err as Error).message}`));
  }

  // ───────────────────────────── Viaje del celular ─────────────────────────────

  /**
   * El viaje asignado al celular: abierto (listo o en camino) o terminado hace menos de 12 h (solo lectura).
   * Un celular no puede tener dos abiertos; si hubiera (datos viejos), gana el más reciente.
   */
  async viajeDelCelular(celular: CelularAutenticado): Promise<ViajeDelCelular | null> {
    const abiertos = await this.prisma.$queryRaw<ViajeDelCelular[]>`
      SELECT "id", "companyId", "numeroGuia", "tipoCustodia"::text AS "tipoCustodia", "estado"::text AS "estado", "cliente"
      FROM "Custodia"
      WHERE "dispositivoId" = ${celular.id} AND "companyId" = ${celular.companyId} AND "estado" <> 'LLEGO'
      ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`;
    if (abiertos[0]) return abiertos[0];
    const terminados = await this.prisma.$queryRaw<ViajeDelCelular[]>`
      SELECT "id", "companyId", "numeroGuia", "tipoCustodia"::text AS "tipoCustodia", "estado"::text AS "estado", "cliente"
      FROM "Custodia"
      WHERE "dispositivoId" = ${celular.id} AND "companyId" = ${celular.companyId} AND "estado" = 'LLEGO'
        AND COALESCE("fechaHoraLlegada", "updatedAt") > now() - (${HORAS_SOLO_LECTURA}::int * interval '1 hour')
      ORDER BY COALESCE("fechaHoraLlegada", "updatedAt") DESC, "id" DESC LIMIT 1`;
    return terminados[0] ?? null;
  }

  // ───────────────────────────── Sesión de la persona ─────────────────────────────

  /**
   * La sesión sigue valiendo si no se cerró, es reciente, el viaje sigue asignado a ESTE celular y la persona sigue
   * en el viaje con la misma cédula (la oficina pudo cambiar el personal). null si no.
   */
  async autenticarSesion(celular: CelularAutenticado, token: string): Promise<SesionAutenticada | null> {
    const filas = await this.prisma.$queryRaw<
      { id: number; custodiaId: number; cedula: string; nombre: string; rol: string }[]
    >`
      SELECT "id", "custodiaId", "cedula", "nombre", "rol" FROM "CustodiaSesion"
      WHERE "tokenHash" = ${hashearToken(token)} AND "dispositivoId" = ${celular.id} AND "cerradaEn" IS NULL
        AND "creadaEn" > now() - (${VIDA_SESION_DIAS}::int * interval '1 day')`;
    const s = filas[0];
    if (!s) return null;
    const viaje = await this.viajeDelCelular(celular);
    if (!viaje || viaje.id !== s.custodiaId) return null;
    const personas = await this.personalDe(s.custodiaId);
    const yo = personas.find((p) => p.rol === s.rol);
    if (!yo || !yo.cedula || yo.cedula !== s.cedula) return null;
    return {
      id: s.id,
      custodiaId: s.custodiaId,
      companyId: celular.companyId,
      dispositivoId: celular.id,
      cedula: s.cedula,
      nombre: yo.nombre,
      rol: s.rol as RolViaje,
    };
  }

  mensajeSesionInvalida(): UnauthorizedException {
    return new UnauthorizedException(MENSAJE_SESION);
  }

  private async personalDe(custodiaId: number) {
    const filas = await this.prisma.$queryRaw<Record<string, string | null>[]>`
      SELECT "choferName", "choferCedula", "custodio1Name", "custodio1Cedula", "custodio2Name", "custodio2Cedula",
             "custodio3Name", "custodio3Cedula", "custodio4Name", "custodio4Cedula"
      FROM "Custodia" WHERE "id" = ${custodiaId}`;
    return filas[0] ? personasDelViaje(filas[0]) : [];
  }

  /**
   * Entrar con cédula y PIN. La cédula debe ser de una persona del viaje y tener PIN. Siempre el mismo mensaje de
   * error (no revela si la cédula existe) y 5 fallos seguidos bloquean el celular 15 minutos.
   */
  async iniciarSesion(
    celular: CelularAutenticado,
    cedulaCruda: unknown,
    pinCrudo: unknown,
  ): Promise<{ sesion: string; nombre: string; rol: RolViaje }> {
    const estado = await this.prisma.$queryRaw<{ bloqueadoHasta: Date | null }[]>`
      SELECT "bloqueadoHasta" FROM "CustodiaDispositivo" WHERE "id" = ${celular.id}`;
    const bloqueo = estado[0]?.bloqueadoHasta ?? null;
    if (bloqueo && bloqueo.getTime() > Date.now()) {
      throw new HttpException(MENSAJE_BLOQUEO, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (bloqueo) {
      // El bloqueo ya pasó: se empieza de cero.
      await this.prisma.$executeRaw`
        UPDATE "CustodiaDispositivo" SET "intentosFallidos" = 0, "bloqueadoHasta" = NULL WHERE "id" = ${celular.id}`;
    }

    const viaje = await this.viajeDelCelular(celular);
    if (!viaje) throw new BadRequestException('Este celular no tiene un viaje asignado.');

    const cedula = normalizarCedula(cedulaCruda);
    const personas = await this.personalDe(viaje.id);
    const persona = cedula ? personas.find((p) => p.cedula === cedula) : undefined;
    const pinFila = persona
      ? (
          await this.prisma.$queryRaw<{ pinHash: string }[]>`
            SELECT "pinHash" FROM "CustodiaPin" WHERE "companyId" = ${celular.companyId} AND "cedula" = ${cedula}`
        )[0]
      : undefined;
    // Siempre se gasta el mismo tiempo, exista o no la cédula.
    const pinOk = await verificarPin(esPinValido(pinCrudo) ? pinCrudo : '0000', pinFila?.pinHash ?? HASH_PIN_FALSO);
    if (!persona || !pinFila || !pinOk || !esPinValido(pinCrudo)) {
      await this.anotarFallo(celular.id);
      throw new BadRequestException(MENSAJE_PIN_MALO);
    }

    const token = generarTokenSesion();
    // En un celular solo hay una sesión abierta a la vez.
    await this.prisma.$executeRaw`
      UPDATE "CustodiaSesion" SET "cerradaEn" = now() WHERE "dispositivoId" = ${celular.id} AND "cerradaEn" IS NULL`;
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaSesion" ("custodiaId", "dispositivoId", "cedula", "nombre", "rol", "tokenHash")
      VALUES (${viaje.id}, ${celular.id}, ${persona.cedula}, ${persona.nombre}, ${persona.rol}, ${hashearToken(token)})`;
    await this.prisma.$executeRaw`
      UPDATE "CustodiaDispositivo" SET "intentosFallidos" = 0, "bloqueadoHasta" = NULL WHERE "id" = ${celular.id}`;
    return { sesion: token, nombre: persona.nombre, rol: persona.rol };
  }

  private async anotarFallo(dispositivoId: number): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ bloqueadoHasta: Date | null }[]>`
      UPDATE "CustodiaDispositivo"
      SET "intentosFallidos" = "intentosFallidos" + 1,
          "bloqueadoHasta" = CASE WHEN "intentosFallidos" + 1 >= ${FALLOS_PARA_BLOQUEO}
                                  THEN now() + interval '15 minutes' ELSE "bloqueadoHasta" END
      WHERE "id" = ${dispositivoId}
      RETURNING "bloqueadoHasta"`;
    const hasta = filas[0]?.bloqueadoHasta;
    if (hasta && hasta.getTime() > Date.now()) {
      this.logger.warn(`Celular ${dispositivoId} bloqueado 15 minutos por intentos fallidos de PIN.`);
      throw new HttpException(MENSAJE_BLOQUEO, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async cerrarSesion(sesion: SesionAutenticada): Promise<void> {
    await this.prisma.$executeRaw`UPDATE "CustodiaSesion" SET "cerradaEn" = now() WHERE "id" = ${sesion.id}`;
  }
}
