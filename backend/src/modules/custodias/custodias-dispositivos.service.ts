import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CODIGO_VIGENCIA_MS,
  generarCodigo,
  hashear,
  normalizarCodigo,
} from '../bitacora/bitacora-extension.util';
import {
  ETIQUETA_ROL,
  type RolViaje,
  ROLES_VIAJE,
  esCedulaConPin,
  esRolViaje,
  generarPin,
  hashearPin,
  normalizarCedula,
  texto,
} from './custodias-campo-seguridad.util';

const MAX_NOMBRE = 60;

/** Datos del viaje que importan para asignar celular y custodio a cargo. */
export interface PersonalDeViaje {
  choferName?: string | null;
  choferCedula?: string | null;
  custodio1Name?: string | null;
  custodio1Cedula?: string | null;
  custodio2Name?: string | null;
  custodio2Cedula?: string | null;
  custodio3Name?: string | null;
  custodio3Cedula?: string | null;
  custodio4Name?: string | null;
  custodio4Cedula?: string | null;
}

/** Nombre y cédula de cada puesto del viaje (chofer custodio y custodios 1 a 4), con el nombre limpio. */
export function personasDelViaje(v: PersonalDeViaje): { rol: RolViaje; nombre: string; cedula: string }[] {
  const campos: Record<RolViaje, [string | null | undefined, string | null | undefined]> = {
    chofer: [v.choferName, v.choferCedula],
    custodio1: [v.custodio1Name, v.custodio1Cedula],
    custodio2: [v.custodio2Name, v.custodio2Cedula],
    custodio3: [v.custodio3Name, v.custodio3Cedula],
    custodio4: [v.custodio4Name, v.custodio4Cedula],
  };
  return ROLES_VIAJE.map((rol) => ({
    rol,
    nombre: (campos[rol][0] ?? '').trim(),
    cedula: normalizarCedula(campos[rol][1] ?? ''),
  })).filter((p) => !!p.nombre);
}

export interface DispositivoFila {
  id: number;
  nombre: string;
  creadoEn: Date;
  ultimoUso: Date | null;
  revocadoEn: Date | null;
  viajeId: number | null;
  numeroGuia: string | null;
  estado: string | null;
}

export interface PinFila {
  cedula: string;
  nombre: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Celulares de la empresa y PIN de los custodios (2026-11-24, Fase 2), vistos desde la oficina. Solo se guarda el
 * hash del token del celular y el hash del PIN (scrypt): ninguno de los dos se puede volver a ver.
 */
@Injectable()
export class CustodiasDispositivosService {
  private readonly logger = new Logger(CustodiasDispositivosService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── Celulares ─────────────────────────────

  /** Código de un solo uso (10 minutos) para vincular un celular nuevo. */
  async crearCodigo(companyId: number, userId: number, nombreCrudo: unknown): Promise<{ codigo: string; expiraEn: string }> {
    const nombre = texto(nombreCrudo, MAX_NOMBRE);
    if (!nombre) throw new BadRequestException('Escribe un nombre para el celular.');
    // Los códigos vencidos de la empresa ya no sirven para nada.
    await this.prisma.$executeRaw`
      DELETE FROM "CustodiaDispositivoCodigo" WHERE "companyId" = ${companyId} AND "expiraEn" < now()`;
    const expiraEn = new Date(Date.now() + CODIGO_VIGENCIA_MS);
    for (let intento = 0; intento < 5; intento++) {
      const codigo = generarCodigo();
      const codigoHash = hashear(normalizarCodigo(codigo) as string);
      try {
        await this.prisma.$executeRaw`
          INSERT INTO "CustodiaDispositivoCodigo" ("companyId", "nombre", "codigoHash", "expiraEn", "creadoPor")
          VALUES (${companyId}, ${nombre}, ${codigoHash}, ${expiraEn}, ${userId})`;
        return { codigo, expiraEn: expiraEn.toISOString() };
      } catch (err) {
        // Dos códigos iguales a la vez son casi imposibles; si pasa, se genera otro.
        this.logger.warn(`No se pudo guardar el código de vinculación (intento ${intento + 1}): ${(err as Error).message}`);
      }
    }
    throw new BadRequestException('No se pudo generar el código. Inténtalo de nuevo.');
  }

  /**
   * «Vincular de nuevo»: un código de 10 minutos para el MISMO celular (mismo registro y nombre, así los viajes
   * viejos siguen apuntando a él). Al escribirlo en el celular, vuelve a quedar activo con un token nuevo; el viejo
   * sigue sin valer.
   */
  async crearCodigoVincularDeNuevo(
    companyId: number,
    userId: number,
    id: number,
  ): Promise<{ codigo: string; expiraEn: string; nombre: string }> {
    const filas = await this.prisma.$queryRaw<{ nombre: string; revocadoEn: Date | null }[]>`
      SELECT "nombre", "revocadoEn" FROM "CustodiaDispositivo" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    const celular = filas[0];
    if (!celular) throw new NotFoundException('Celular no encontrado.');
    if (!celular.revocadoEn) throw new BadRequestException('Este celular ya está vinculado.');
    // Los códigos vencidos y los que ya había pedido para este mismo celular dejan de servir.
    await this.prisma.$executeRaw`
      DELETE FROM "CustodiaDispositivoCodigo"
      WHERE "companyId" = ${companyId} AND ("expiraEn" < now() OR "dispositivoId" = ${id})`;
    const expiraEn = new Date(Date.now() + CODIGO_VIGENCIA_MS);
    for (let intento = 0; intento < 5; intento++) {
      const codigo = generarCodigo();
      const codigoHash = hashear(normalizarCodigo(codigo) as string);
      try {
        await this.prisma.$executeRaw`
          INSERT INTO "CustodiaDispositivoCodigo" ("companyId", "nombre", "codigoHash", "expiraEn", "creadoPor", "dispositivoId")
          VALUES (${companyId}, ${celular.nombre}, ${codigoHash}, ${expiraEn}, ${userId}, ${id})`;
        return { codigo, expiraEn: expiraEn.toISOString(), nombre: celular.nombre };
      } catch (err) {
        this.logger.warn(`No se pudo guardar el código para vincular de nuevo (intento ${intento + 1}): ${(err as Error).message}`);
      }
    }
    throw new BadRequestException('No se pudo generar el código. Inténtalo de nuevo.');
  }

  async renombrar(companyId: number, id: number, nombreCrudo: unknown) {
    const nombre = texto(nombreCrudo, MAX_NOMBRE);
    if (!nombre) throw new BadRequestException('Escribe un nombre para el celular.');
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      UPDATE "CustodiaDispositivo" SET "nombre" = ${nombre}
      WHERE "id" = ${id} AND "companyId" = ${companyId}
      RETURNING "id"`;
    if (filas.length === 0) throw new NotFoundException('Celular no encontrado.');
    return { ok: true, nombre };
  }

  /** «Quitar de la lista»: oculta un celular ya desvinculado. Los viajes que lo usaron siguen mostrando su nombre. */
  async quitarDeLaLista(companyId: number, id: number) {
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      UPDATE "CustodiaDispositivo" SET "archivadoEn" = COALESCE("archivadoEn", now())
      WHERE "id" = ${id} AND "companyId" = ${companyId} AND "revocadoEn" IS NOT NULL
      RETURNING "id"`;
    if (filas.length > 0) return { ok: true };
    const existe = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "CustodiaDispositivo" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (existe.length === 0) throw new NotFoundException('Celular no encontrado.');
    throw new BadRequestException('Solo se pueden quitar de la lista los celulares desvinculados.');
  }

  async listar(companyId: number) {
    const filas = await this.prisma.$queryRaw<DispositivoFila[]>`
      SELECT d."id", d."nombre", d."creadoEn", d."ultimoUso", d."revocadoEn",
             c."id" AS "viajeId", c."numeroGuia", c."estado"::text AS "estado"
      FROM "CustodiaDispositivo" d
      LEFT JOIN LATERAL (
        SELECT "id", "numeroGuia", "estado" FROM "Custodia"
        WHERE "dispositivoId" = d."id" AND "estado" <> 'LLEGO'
        ORDER BY "createdAt" DESC LIMIT 1
      ) c ON true
      WHERE d."companyId" = ${companyId} AND d."archivadoEn" IS NULL
      ORDER BY (d."revocadoEn" IS NOT NULL), d."creadoEn" DESC, d."id" DESC`;
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      creadoEn: f.creadoEn,
      ultimoUso: f.ultimoUso,
      revocado: !!f.revocadoEn,
      viajeActual: f.viajeId ? { id: f.viajeId, numeroGuia: f.numeroGuia as string, estado: f.estado as string } : null,
    }));
  }

  /** Revoca el token del celular y cierra las sesiones abiertas en él. */
  async desvincular(companyId: number, id: number) {
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      UPDATE "CustodiaDispositivo" SET "revocadoEn" = COALESCE("revocadoEn", now())
      WHERE "id" = ${id} AND "companyId" = ${companyId}
      RETURNING "id"`;
    if (filas.length === 0) throw new NotFoundException('Celular no encontrado.');
    await this.prisma.$executeRaw`
      UPDATE "CustodiaSesion" SET "cerradaEn" = now() WHERE "dispositivoId" = ${id} AND "cerradaEn" IS NULL`;
    return { ok: true };
  }

  /** El celular elegido para un viaje: debe ser de la empresa y no estar revocado. */
  async celularAsignable(companyId: number, id: number) {
    const filas = await this.prisma.$queryRaw<{ id: number; nombre: string; revocadoEn: Date | null }[]>`
      SELECT "id", "nombre", "revocadoEn" FROM "CustodiaDispositivo"
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    const f = filas[0];
    if (!f) throw new BadRequestException('El celular elegido no existe.');
    if (f.revocadoEn) throw new BadRequestException('Ese celular ya fue desvinculado. Elige otro.');
    return { id: f.id, nombre: f.nombre };
  }

  /** Nombre del celular de un viaje (aunque ya esté desvinculado), para el detalle. */
  async celularDeViaje(companyId: number, id: number | null | undefined) {
    if (!id) return null;
    const filas = await this.prisma.$queryRaw<{ id: number; nombre: string }[]>`
      SELECT "id", "nombre" FROM "CustodiaDispositivo" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    return filas[0] ?? null;
  }

  /** Un celular no puede tener dos viajes abiertos (estado distinto de LLEGO). */
  async exigirCelularLibre(dispositivoId: number, viajeIdActual?: number) {
    const filas = await this.prisma.$queryRaw<{ id: number; numeroGuia: string }[]>`
      SELECT "id", "numeroGuia" FROM "Custodia"
      WHERE "dispositivoId" = ${dispositivoId} AND "estado" <> 'LLEGO'
        AND "id" <> ${viajeIdActual ?? 0}
      LIMIT 1`;
    if (filas[0]) throw new ConflictException(`Ese celular ya tiene asignado el viaje ${filas[0].numeroGuia}.`);
  }

  // ───────────────────────────── PIN ─────────────────────────────

  async listarPines(companyId: number) {
    const filas = await this.prisma.$queryRaw<PinFila[]>`
      SELECT "cedula", "nombre", "creadoEn", "actualizadoEn" FROM "CustodiaPin"
      WHERE "companyId" = ${companyId} ORDER BY lower("nombre") ASC`;
    return filas;
  }

  /** Cédulas con PIN entre las dadas (para avisar al armar el viaje). */
  async cedulasConPin(companyId: number, cedulas: string[]): Promise<Set<string>> {
    const lista = cedulas.filter(Boolean);
    if (lista.length === 0) return new Set();
    const filas = await this.prisma.$queryRaw<{ cedula: string }[]>`
      SELECT "cedula" FROM "CustodiaPin" WHERE "companyId" = ${companyId} AND "cedula" = ANY(${lista}::text[])`;
    return new Set(filas.map((f) => f.cedula));
  }

  /** Genera un PIN nuevo (reemplaza el anterior). El PIN solo se devuelve aquí, una vez. */
  async crearPin(companyId: number, userId: number, cedulaCruda: unknown, nombreCrudo: unknown) {
    const cedula = normalizarCedula(cedulaCruda);
    if (!esCedulaConPin(cedula)) {
      throw new BadRequestException(
        'Esta persona no tiene cédula registrada; agrégala en Personal antes de darle un PIN',
      );
    }
    const nombre = texto(nombreCrudo, 150);
    if (!nombre) throw new BadRequestException('Escribe el nombre de la persona.');
    const pin = generarPin();
    const pinHash = await hashearPin(pin);
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaPin" ("companyId", "cedula", "nombre", "pinHash", "creadoPor")
      VALUES (${companyId}, ${cedula}, ${nombre}, ${pinHash}, ${userId})
      ON CONFLICT ("companyId", "cedula")
      DO UPDATE SET "nombre" = EXCLUDED."nombre", "pinHash" = EXCLUDED."pinHash",
                    "creadoPor" = EXCLUDED."creadoPor", "actualizadoEn" = now()`;
    // Con un PIN nuevo, lo que estaba abierto con el anterior ya no vale.
    await this.cerrarSesionesDe(companyId, cedula);
    return { cedula, nombre, pin };
  }

  async quitarPin(companyId: number, cedulaCruda: string) {
    const cedula = normalizarCedula(cedulaCruda);
    const n = await this.prisma.$executeRaw`
      DELETE FROM "CustodiaPin" WHERE "companyId" = ${companyId} AND "cedula" = ${cedula}`;
    if (n === 0) throw new NotFoundException('Esa persona no tiene PIN.');
    await this.cerrarSesionesDe(companyId, cedula);
    return { ok: true };
  }

  private async cerrarSesionesDe(companyId: number, cedula: string) {
    await this.prisma.$executeRaw`
      UPDATE "CustodiaSesion" SET "cerradaEn" = now()
      WHERE "cedula" = ${cedula} AND "cerradaEn" IS NULL
        AND "dispositivoId" IN (SELECT "id" FROM "CustodiaDispositivo" WHERE "companyId" = ${companyId})`;
  }

  // ───────────────────────────── Asignación al viaje ─────────────────────────────

  /**
   * Revisa el celular y el custodio a cargo que llegan al crear o editar un viaje y devuelve el valor FINAL de cada
   * uno (undefined = no se toca). `viajeId` es el viaje que se edita (para no chocar consigo mismo).
   */
  async validarAsignacion(
    companyId: number,
    p: {
      dispositivoId?: number | null;
      custodioACargo?: string | null;
      actual?: { id: number; dispositivoId: number | null; custodioACargo: string | null; estado: string } | null;
      personal: PersonalDeViaje;
      estado?: string;
    },
  ): Promise<{ dispositivoId: number | null | undefined; custodioACargo: string | null | undefined }> {
    const actual = p.actual ?? null;
    let dispositivoId: number | null | undefined;
    if (p.dispositivoId !== undefined) {
      if (p.dispositivoId === null) {
        dispositivoId = null;
      } else if (actual && actual.dispositivoId === p.dispositivoId) {
        // Sigue el mismo celular que ya tenía: no se revalida (aunque ya esté desvinculado).
        dispositivoId = p.dispositivoId;
      } else {
        const celular = await this.celularAsignable(companyId, p.dispositivoId);
        if ((actual?.estado ?? p.estado ?? 'LISTO_PARA_CUSTODIAR') !== 'LLEGO') {
          await this.exigirCelularLibre(celular.id, actual?.id);
        }
        dispositivoId = celular.id;
      }
    }

    let custodioACargo: string | null | undefined;
    if (p.custodioACargo !== undefined) {
      const crudo = p.custodioACargo === null ? '' : String(p.custodioACargo).trim();
      if (!crudo) {
        custodioACargo = null;
      } else if (!esRolViaje(crudo)) {
        throw new BadRequestException('El custodio a cargo no es válido.');
      } else {
        custodioACargo = crudo;
      }
    }

    // Con el personal final del viaje, el custodio a cargo (nuevo o el que ya tenía) debe tener nombre.
    const finalCustodio = custodioACargo !== undefined ? custodioACargo : (actual?.custodioACargo ?? null);
    if (finalCustodio) {
      const persona = personasDelViaje(p.personal).find((x) => x.rol === finalCustodio);
      if (!persona) {
        throw new BadRequestException(
          `El custodio a cargo (${ETIQUETA_ROL[finalCustodio as RolViaje] ?? finalCustodio}) debe ser una persona del viaje.`,
        );
      }
    }
    return { dispositivoId, custodioACargo };
  }

  /** Avisos del viaje para la oficina (no bloquean nada): quién a cargo todavía no tiene PIN. */
  async avisos(
    companyId: number,
    viaje: PersonalDeViaje & { custodioACargo?: string | null; dispositivoId?: number | null },
  ): Promise<string[]> {
    const avisos: string[] = [];
    if (!viaje.custodioACargo || !esRolViaje(viaje.custodioACargo)) return avisos;
    const persona = personasDelViaje(viaje).find((p) => p.rol === viaje.custodioACargo);
    if (!persona) return avisos;
    const conPin = persona.cedula ? await this.cedulasConPin(companyId, [persona.cedula]) : new Set<string>();
    if (!conPin.has(persona.cedula)) avisos.push(`${persona.nombre} todavía no tiene PIN`);
    return avisos;
  }
}
