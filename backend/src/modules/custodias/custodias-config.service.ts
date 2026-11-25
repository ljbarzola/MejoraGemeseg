import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ASUNTO_CORREO_DEFECTO,
  TEXTO_CORREO_DEFECTO,
} from './custodias.schema';
import {
  esMomentoFirma,
  leerJson,
  normalizarCorreos,
  type MomentoFirma,
} from './custodias-campo.util';
import type { GuiaCustodia } from './custodia-guia.types';
import { normalizarFotosPedidas, resolverFotosPedidas, type FotosPedidas } from './custodias-fotos-pedidas.util';

export const TIPOS_SERVICIO = ['PUERTO', 'HACIENDA', 'VIP', 'TODOS'] as const;
export const BLOQUES_CAMPO = ['GENERAL', 'CONTENEDOR', 'HACIENDA'] as const;
export const TIPOS_CAMPO = ['TEXTO', 'NUMERO', 'FECHA', 'LISTA', 'SI_NO'] as const;
export const LLENA_QUIEN = ['OFICINA', 'CUSTODIO'] as const;

const MAX_PUNTOS_RUTA = 30;
const MAX_COPIAS = 20;

/** Los cinco sellos que trae cada empresa de entrada (bloque CONTENEDOR, solo Puerto). */
const SELLOS_INICIALES = [
  'Sello plástico',
  'Sello botella',
  'Sello alambre',
  'Candado satelital',
  'Sello adhesivo',
];

export interface CampoGuia {
  id: number;
  tipoServicio: string;
  bloque: string;
  nombre: string;
  tipo: string;
  opciones: string[];
  obligatorio: boolean;
  llenaQuien: string;
  orden: number;
  enPdf: boolean;
  esSello: boolean;
  activo: boolean;
}

export interface RutaConPuntos {
  id: number;
  nombre: string;
  origen: string;
  destino: string;
  activo: boolean;
  minutosTotal: number;
  puntos: { id: number; orden: number; nombre: string; minutosDesdeAnterior: number }[];
}

interface ConfigFila {
  firmaMomento: string;
  firmaObligatoria: boolean;
  correoCopias: unknown;
  correoAsunto: string;
  correoTexto: string;
  telefonoOperaciones: string | null;
  diasEnlaceFotos: number;
  fotosPedidas: unknown;
}

export interface ConfigCustodias {
  firmaMomento: MomentoFirma;
  firmaObligatoria: boolean;
  correoCopias: string[];
  correoAsunto: string;
  correoTexto: string;
  telefonoOperaciones: string | null;
  /** Días que dura el enlace de fotos que se manda al cliente. */
  diasEnlaceFotos: number;
  /** Fotos que se piden al salir y al llegar, por tipo de servicio (ya con lo de por defecto donde no se guardó nada). */
  fotosPedidas: FotosPedidas;
}

/** Configuración de las custodias en campo: firmas, rutas, campos de la guía y correo. Todo por empresa. */
@Injectable()
export class CustodiasConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Los super admin sin empresa no tienen configuración propia: deben elegir una. */
  exigirEmpresa(companyId: number | null | undefined): number {
    if (!companyId) throw new BadRequestException('Elige una empresa.');
    return companyId;
  }

  // ───────────────────────────── Sembrado perezoso ─────────────────────────────

  /**
   * La primera vez que se pide la configuración de una empresa: crea su fila y los 5 sellos iniciales, todo en una
   * transacción. La marca `camposSembrados` evita volver a crearlos si alguien los desactiva o los renombra.
   */
  async asegurarSembrado(companyId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "CustodiaConfig" ("companyId") VALUES (${companyId})
        ON CONFLICT ("companyId") DO NOTHING`;
      const filas = await tx.$queryRaw<{ camposSembrados: boolean }[]>`
        SELECT "camposSembrados" FROM "CustodiaConfig" WHERE "companyId" = ${companyId} FOR UPDATE`;
      if (filas[0]?.camposSembrados) return;
      let orden = 1;
      for (const nombre of SELLOS_INICIALES) {
        await tx.$executeRaw`
          INSERT INTO "CustodiaCampo"
            ("companyId", "tipoServicio", "bloque", "nombre", "tipo", "opciones", "obligatorio", "llenaQuien",
             "orden", "enPdf", "esSello", "activo")
          VALUES (${companyId}, 'PUERTO', 'CONTENEDOR', ${nombre}, 'TEXTO', '[]'::jsonb, false, 'CUSTODIO',
                  ${orden}, true, true, true)`;
        orden++;
      }
      await tx.$executeRaw`
        UPDATE "CustodiaConfig" SET "camposSembrados" = true, "updatedAt" = now() WHERE "companyId" = ${companyId}`;
    });
  }

  // ───────────────────────────── Firmas y correo ─────────────────────────────

  private mapearConfig(f: ConfigFila | undefined): ConfigCustodias {
    return {
      firmaMomento: esMomentoFirma(f?.firmaMomento) ? f.firmaMomento : 'LLEGADA',
      firmaObligatoria: !!f?.firmaObligatoria,
      correoCopias: leerJson<string[]>(f?.correoCopias, []),
      correoAsunto: f?.correoAsunto || ASUNTO_CORREO_DEFECTO,
      correoTexto: f?.correoTexto || TEXTO_CORREO_DEFECTO,
      telefonoOperaciones: f?.telefonoOperaciones ?? null,
      diasEnlaceFotos: Number.isInteger(f?.diasEnlaceFotos) && f!.diasEnlaceFotos > 0 ? f!.diasEnlaceFotos : 90,
      fotosPedidas: resolverFotosPedidas(f?.fotosPedidas),
    };
  }

  /** La configuración general de la empresa (sin la lista de cambios por cliente). */
  async leerConfig(companyId: number): Promise<ConfigCustodias> {
    await this.asegurarSembrado(companyId);
    const filas = await this.prisma.$queryRaw<ConfigFila[]>`
      SELECT "firmaMomento", "firmaObligatoria", "correoCopias", "correoAsunto", "correoTexto", "telefonoOperaciones",
             "diasEnlaceFotos", "fotosPedidas"
      FROM "CustodiaConfig" WHERE "companyId" = ${companyId}`;
    return this.mapearConfig(filas[0]);
  }

  async getConfig(companyId: number) {
    const config = await this.leerConfig(companyId);
    const firmasPorCliente = await this.prisma.$queryRaw<
      { salesClientId: number; cliente: string; firmaMomento: string }[]
    >`
      SELECT f."salesClientId", c."name" AS "cliente", f."firmaMomento"
      FROM "CustodiaFirmaCliente" f
      JOIN "SalesClient" c ON c."id" = f."salesClientId"
      WHERE f."companyId" = ${companyId}
      ORDER BY lower(c."name") ASC`;
    return { ...config, firmasPorCliente };
  }

  async updateConfig(
    companyId: number,
    dto: {
      firmaMomento?: string;
      firmaObligatoria?: boolean;
      correoCopias?: unknown;
      correoAsunto?: string;
      correoTexto?: string;
      telefonoOperaciones?: string | null;
      diasEnlaceFotos?: number;
      fotosPedidas?: unknown;
    },
  ) {
    const actual = await this.leerConfig(companyId);
    let firmaMomento = actual.firmaMomento;
    if (dto.firmaMomento !== undefined) {
      if (!esMomentoFirma(dto.firmaMomento)) {
        throw new BadRequestException('El momento de la firma debe ser al salir, al llegar o en los dos.');
      }
      firmaMomento = dto.firmaMomento;
    }
    const copias =
      dto.correoCopias !== undefined
        ? normalizarCorreos(dto.correoCopias, { max: MAX_COPIAS, etiqueta: 'las copias' })
        : actual.correoCopias;
    let asunto = actual.correoAsunto;
    if (dto.correoAsunto !== undefined) {
      asunto = dto.correoAsunto.trim();
      if (!asunto) throw new BadRequestException('Escribe el asunto del correo.');
    }
    let texto = actual.correoTexto;
    if (dto.correoTexto !== undefined) {
      texto = dto.correoTexto.trim();
      if (!texto) throw new BadRequestException('Escribe el texto del correo.');
    }
    let telefono = actual.telefonoOperaciones;
    if (dto.telefonoOperaciones !== undefined) {
      telefono = (dto.telefonoOperaciones ?? '').trim().slice(0, 60) || null;
    }
    let dias = actual.diasEnlaceFotos;
    if (dto.diasEnlaceFotos !== undefined) {
      if (!Number.isInteger(dto.diasEnlaceFotos) || dto.diasEnlaceFotos < 1 || dto.diasEnlaceFotos > 730) {
        throw new BadRequestException('Los días del enlace de fotos deben estar entre 1 y 730.');
      }
      dias = dto.diasEnlaceFotos;
    }
    // Solo se escribe si llegó (guardar las firmas o el correo no fija las fotos de por defecto).
    const fotosPedidas = dto.fotosPedidas !== undefined ? JSON.stringify(normalizarFotosPedidas(dto.fotosPedidas)) : null;
    await this.prisma.$executeRaw`
      UPDATE "CustodiaConfig"
      SET "firmaMomento" = ${firmaMomento},
          "firmaObligatoria" = ${dto.firmaObligatoria ?? actual.firmaObligatoria},
          "correoCopias" = ${JSON.stringify(copias)}::jsonb,
          "correoAsunto" = ${asunto},
          "correoTexto" = ${texto},
          "telefonoOperaciones" = ${telefono},
          "diasEnlaceFotos" = ${dias},
          "fotosPedidas" = COALESCE(${fotosPedidas}::jsonb, "fotosPedidas"),
          "updatedAt" = now()
      WHERE "companyId" = ${companyId}`;
    return this.getConfig(companyId);
  }

  private async exigirClienteDirectorio(companyId: number, salesClientId: number) {
    const cliente = await this.prisma.salesClient.findFirst({
      where: { id: salesClientId, companyId },
      select: { id: true, name: true },
    });
    if (!cliente) throw new NotFoundException('Ese cliente no está en el Directorio.');
    return cliente;
  }

  async guardarFirmaCliente(companyId: number, salesClientId: number, firmaMomento: string) {
    if (!esMomentoFirma(firmaMomento)) {
      throw new BadRequestException('El momento de la firma debe ser al salir, al llegar o en los dos.');
    }
    await this.leerConfig(companyId);
    await this.exigirClienteDirectorio(companyId, salesClientId);
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaFirmaCliente" ("companyId", "salesClientId", "firmaMomento")
      VALUES (${companyId}, ${salesClientId}, ${firmaMomento})
      ON CONFLICT ("companyId", "salesClientId") DO UPDATE SET "firmaMomento" = EXCLUDED."firmaMomento"`;
    return this.getConfig(companyId);
  }

  async quitarFirmaCliente(companyId: number, salesClientId: number) {
    await this.leerConfig(companyId);
    await this.prisma.$executeRaw`
      DELETE FROM "CustodiaFirmaCliente" WHERE "companyId" = ${companyId} AND "salesClientId" = ${salesClientId}`;
    return this.getConfig(companyId);
  }

  /** Cuándo se firma un viaje: lo que se ajustó en el viaje, o lo del cliente, o lo general de la empresa. */
  async firmaMomentoEfectivo(
    companyId: number,
    guia: GuiaCustodia | null | undefined,
    clienteId: number | null | undefined,
  ): Promise<MomentoFirma> {
    if (esMomentoFirma(guia?.firmaMomento)) return guia.firmaMomento;
    if (clienteId) {
      const filas = await this.prisma.$queryRaw<{ firmaMomento: string }[]>`
        SELECT "firmaMomento" FROM "CustodiaFirmaCliente"
        WHERE "companyId" = ${companyId} AND "salesClientId" = ${clienteId}`;
      if (esMomentoFirma(filas[0]?.firmaMomento)) return filas[0].firmaMomento;
    }
    return (await this.leerConfig(companyId)).firmaMomento;
  }

  // ───────────────────────────── Rutas ─────────────────────────────

  async listarRutas(companyId: number, incluirInactivas = false): Promise<RutaConPuntos[]> {
    const rutas = await this.prisma.$queryRaw<
      { id: number; nombre: string; origen: string; destino: string; activo: boolean }[]
    >`
      SELECT "id", "nombre", "origen", "destino", "activo" FROM "CustodiaRuta"
      WHERE "companyId" = ${companyId} AND (${incluirInactivas}::boolean OR "activo" = true)
      ORDER BY lower("nombre") ASC, "id" ASC`;
    if (rutas.length === 0) return [];
    const ids = rutas.map((r) => r.id);
    const puntos = await this.prisma.$queryRaw<
      { id: number; rutaId: number; orden: number; nombre: string; minutosDesdeAnterior: number }[]
    >`
      SELECT "id", "rutaId", "orden", "nombre", "minutosDesdeAnterior" FROM "CustodiaRutaPunto"
      WHERE "rutaId" = ANY(${ids}::int[]) ORDER BY "rutaId" ASC, "orden" ASC`;
    return rutas.map((r) => {
      const suyos = puntos.filter((p) => p.rutaId === r.id);
      return {
        ...r,
        minutosTotal: suyos.reduce((s, p) => s + p.minutosDesdeAnterior, 0),
        puntos: suyos.map(({ id, orden, nombre, minutosDesdeAnterior }) => ({
          id,
          orden,
          nombre,
          minutosDesdeAnterior,
        })),
      };
    });
  }

  /** Una ruta con sus puntos (activa o no). Null si no es de la empresa. */
  async obtenerRuta(companyId: number, id: number): Promise<RutaConPuntos | null> {
    const todas = await this.listarRutas(companyId, true);
    return todas.find((r) => r.id === id) ?? null;
  }

  private validarRuta(dto: {
    nombre?: string;
    origen?: string;
    destino?: string;
    puntos?: { nombre?: string; minutosDesdeAnterior?: number }[];
  }) {
    const nombre = (dto?.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('Escribe el nombre de la ruta.');
    const puntosEntrada = dto.puntos ?? [];
    if (!Array.isArray(puntosEntrada)) throw new BadRequestException('Los puntos de la ruta no son válidos.');
    if (puntosEntrada.length > MAX_PUNTOS_RUTA) {
      throw new BadRequestException(`Una ruta puede tener hasta ${MAX_PUNTOS_RUTA} puntos.`);
    }
    const puntos = puntosEntrada.map((p, i) => {
      const nombrePunto = (p?.nombre ?? '').trim();
      if (!nombrePunto) throw new BadRequestException(`Escribe el nombre del punto ${i + 1}.`);
      const minutos = Number(p?.minutosDesdeAnterior ?? 0);
      if (!Number.isInteger(minutos) || minutos < 0 || minutos > 10000) {
        throw new BadRequestException(`Los minutos del punto ${i + 1} deben ser un número entero de 0 en adelante.`);
      }
      return { nombre: nombrePunto.slice(0, 150), minutosDesdeAnterior: minutos };
    });
    return {
      nombre: nombre.slice(0, 150),
      origen: (dto.origen ?? '').trim().slice(0, 200),
      destino: (dto.destino ?? '').trim().slice(0, 200),
      puntos,
    };
  }

  async crearRuta(companyId: number, dto: Parameters<CustodiasConfigService['validarRuta']>[0]) {
    const r = this.validarRuta(dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "CustodiaRuta" ("companyId", "nombre", "origen", "destino")
        VALUES (${companyId}, ${r.nombre}, ${r.origen}, ${r.destino}) RETURNING "id"`;
      const rutaId = filas[0].id;
      let orden = 1;
      for (const p of r.puntos) {
        await tx.$executeRaw`
          INSERT INTO "CustodiaRutaPunto" ("rutaId", "orden", "nombre", "minutosDesdeAnterior")
          VALUES (${rutaId}, ${orden}, ${p.nombre}, ${p.minutosDesdeAnterior})`;
        orden++;
      }
      return rutaId;
    });
    return this.obtenerRuta(companyId, id);
  }

  async actualizarRuta(companyId: number, id: number, dto: Parameters<CustodiasConfigService['validarRuta']>[0]) {
    const r = this.validarRuta(dto);
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "CustodiaRuta" SET "nombre" = ${r.nombre}, "origen" = ${r.origen}, "destino" = ${r.destino},
               "updatedAt" = now()
        WHERE "id" = ${id} AND "companyId" = ${companyId}`;
      if (!n) throw new NotFoundException('Ruta no encontrada.');
      await tx.$executeRaw`DELETE FROM "CustodiaRutaPunto" WHERE "rutaId" = ${id}`;
      let orden = 1;
      for (const p of r.puntos) {
        await tx.$executeRaw`
          INSERT INTO "CustodiaRutaPunto" ("rutaId", "orden", "nombre", "minutosDesdeAnterior")
          VALUES (${id}, ${orden}, ${p.nombre}, ${p.minutosDesdeAnterior})`;
        orden++;
      }
    });
    return this.obtenerRuta(companyId, id);
  }

  async activarRuta(companyId: number, id: number, activo: boolean) {
    const n = await this.prisma.$executeRaw`
      UPDATE "CustodiaRuta" SET "activo" = ${activo === true}, "updatedAt" = now()
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (!n) throw new NotFoundException('Ruta no encontrada.');
    return this.obtenerRuta(companyId, id);
  }

  // ───────────────────────────── Campos de la guía ─────────────────────────────

  private mapearCampo(f: Omit<CampoGuia, 'opciones'> & { opciones: unknown }): CampoGuia {
    return { ...f, opciones: leerJson<string[]>(f.opciones, []) };
  }

  async listarCampos(companyId: number, incluirInactivos = false): Promise<CampoGuia[]> {
    await this.asegurarSembrado(companyId);
    const filas = await this.prisma.$queryRaw<(Omit<CampoGuia, 'opciones'> & { opciones: unknown })[]>`
      SELECT "id", "tipoServicio", "bloque", "nombre", "tipo", "opciones", "obligatorio", "llenaQuien", "orden",
             "enPdf", "esSello", "activo"
      FROM "CustodiaCampo"
      WHERE "companyId" = ${companyId} AND (${incluirInactivos}::boolean OR "activo" = true)
      ORDER BY CASE "bloque" WHEN 'GENERAL' THEN 1 WHEN 'CONTENEDOR' THEN 2 ELSE 3 END, "orden" ASC, "id" ASC`;
    return filas.map((f) => this.mapearCampo(f));
  }

  private validarCampo(dto: {
    nombre?: string;
    tipoServicio?: string;
    bloque?: string;
    tipo?: string;
    opciones?: unknown;
    obligatorio?: boolean;
    llenaQuien?: string;
    enPdf?: boolean;
    esSello?: boolean;
  }) {
    const nombre = (dto?.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('Escribe el nombre del campo.');
    if (!(TIPOS_SERVICIO as readonly string[]).includes(dto.tipoServicio ?? '')) {
      throw new BadRequestException('Elige el tipo de servicio del campo.');
    }
    if (!(BLOQUES_CAMPO as readonly string[]).includes(dto.bloque ?? '')) {
      throw new BadRequestException('Elige dónde va el campo en la guía.');
    }
    if (!(TIPOS_CAMPO as readonly string[]).includes(dto.tipo ?? '')) {
      throw new BadRequestException('Elige el tipo de dato del campo.');
    }
    if (dto.bloque === 'CONTENEDOR' && dto.tipoServicio !== 'PUERTO') {
      throw new BadRequestException('Los campos del contenedor solo existen en el servicio de Puerto.');
    }
    if (dto.bloque === 'HACIENDA' && dto.tipoServicio !== 'HACIENDA') {
      throw new BadRequestException('Los campos de la hacienda solo existen en el servicio de Hacienda.');
    }
    const llenaQuien = dto.llenaQuien ?? 'OFICINA';
    if (!(LLENA_QUIEN as readonly string[]).includes(llenaQuien)) {
      throw new BadRequestException('Elige quién llena el campo.');
    }
    let opciones: string[] = [];
    if (dto.tipo === 'LISTA') {
      if (!Array.isArray(dto.opciones)) throw new BadRequestException('Escribe las opciones de la lista.');
      const vistas = new Set<string>();
      for (const o of dto.opciones) {
        const texto = typeof o === 'string' ? o.trim().slice(0, 80) : '';
        if (!texto || vistas.has(texto.toLowerCase())) continue;
        vistas.add(texto.toLowerCase());
        opciones.push(texto);
      }
      if (opciones.length === 0) throw new BadRequestException('Escribe al menos una opción para la lista.');
      if (opciones.length > 50) throw new BadRequestException('La lista puede tener hasta 50 opciones.');
    } else {
      opciones = [];
    }
    return {
      nombre: nombre.slice(0, 100),
      tipoServicio: dto.tipoServicio as string,
      bloque: dto.bloque as string,
      tipo: dto.tipo as string,
      opciones,
      obligatorio: dto.obligatorio === true,
      llenaQuien,
      enPdf: dto.enPdf !== false,
      esSello: dto.bloque === 'CONTENEDOR' && dto.esSello === true,
    };
  }

  /** No puede haber dos campos activos con el mismo nombre en el mismo bloque y servicio. */
  private async exigirNombreLibre(
    companyId: number,
    c: { nombre: string; tipoServicio: string; bloque: string },
    ignorarId?: number,
  ) {
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "CustodiaCampo"
      WHERE "companyId" = ${companyId} AND "activo" = true AND "bloque" = ${c.bloque}
        AND "tipoServicio" = ${c.tipoServicio} AND lower("nombre") = lower(${c.nombre})
        AND "id" <> ${ignorarId ?? 0}`;
    if (filas.length > 0) {
      throw new BadRequestException(`Ya existe un campo «${c.nombre}» en ese lugar de la guía.`);
    }
  }

  async crearCampo(companyId: number, dto: Parameters<CustodiasConfigService['validarCampo']>[0]) {
    await this.asegurarSembrado(companyId);
    const c = this.validarCampo(dto);
    await this.exigirNombreLibre(companyId, c);
    const ult = await this.prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX("orden")::int AS "max" FROM "CustodiaCampo"
      WHERE "companyId" = ${companyId} AND "bloque" = ${c.bloque}`;
    const orden = (ult[0]?.max ?? 0) + 1;
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "CustodiaCampo"
        ("companyId", "tipoServicio", "bloque", "nombre", "tipo", "opciones", "obligatorio", "llenaQuien", "orden",
         "enPdf", "esSello")
      VALUES (${companyId}, ${c.tipoServicio}, ${c.bloque}, ${c.nombre}, ${c.tipo}, ${JSON.stringify(c.opciones)}::jsonb,
              ${c.obligatorio}, ${c.llenaQuien}, ${orden}, ${c.enPdf}, ${c.esSello})
      RETURNING "id"`;
    return this.campoPorId(companyId, filas[0].id);
  }

  async actualizarCampo(companyId: number, id: number, dto: Parameters<CustodiasConfigService['validarCampo']>[0]) {
    const existente = await this.campoPorId(companyId, id);
    const c = this.validarCampo(dto);
    if (existente.activo) await this.exigirNombreLibre(companyId, c, id);
    await this.prisma.$executeRaw`
      UPDATE "CustodiaCampo"
      SET "tipoServicio" = ${c.tipoServicio}, "bloque" = ${c.bloque}, "nombre" = ${c.nombre}, "tipo" = ${c.tipo},
          "opciones" = ${JSON.stringify(c.opciones)}::jsonb, "obligatorio" = ${c.obligatorio},
          "llenaQuien" = ${c.llenaQuien}, "enPdf" = ${c.enPdf}, "esSello" = ${c.esSello}, "updatedAt" = now()
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    return this.campoPorId(companyId, id);
  }

  /** «Borrar» un campo es desactivarlo: los viajes ya guardados siguen mostrando su valor. */
  async activarCampo(companyId: number, id: number, activo: boolean) {
    const existente = await this.campoPorId(companyId, id);
    if (activo === true) await this.exigirNombreLibre(companyId, existente, id);
    await this.prisma.$executeRaw`
      UPDATE "CustodiaCampo" SET "activo" = ${activo === true}, "updatedAt" = now()
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    return this.campoPorId(companyId, id);
  }

  async ordenarCampos(companyId: number, ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      throw new BadRequestException('El orden de los campos no es válido.');
    }
    const unicos = [...new Set(ids.map((n) => Number(n)))];
    if (unicos.some((n) => !Number.isInteger(n))) {
      throw new BadRequestException('El orden de los campos no es válido.');
    }
    const propios = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "CustodiaCampo" WHERE "companyId" = ${companyId} AND "id" = ANY(${unicos}::int[])`;
    if (propios.length !== unicos.length) {
      throw new BadRequestException('Uno de los campos ya no existe. Recarga la lista.');
    }
    await this.prisma.$transaction(async (tx) => {
      let orden = 1;
      for (const id of unicos) {
        await tx.$executeRaw`
          UPDATE "CustodiaCampo" SET "orden" = ${orden}, "updatedAt" = now()
          WHERE "id" = ${id} AND "companyId" = ${companyId}`;
        orden++;
      }
    });
    return this.listarCampos(companyId, true);
  }

  private async campoPorId(companyId: number, id: number): Promise<CampoGuia> {
    const filas = await this.prisma.$queryRaw<(Omit<CampoGuia, 'opciones'> & { opciones: unknown })[]>`
      SELECT "id", "tipoServicio", "bloque", "nombre", "tipo", "opciones", "obligatorio", "llenaQuien", "orden",
             "enPdf", "esSello", "activo"
      FROM "CustodiaCampo" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (filas.length === 0) throw new NotFoundException('Campo no encontrado.');
    return this.mapearCampo(filas[0]);
  }
}
