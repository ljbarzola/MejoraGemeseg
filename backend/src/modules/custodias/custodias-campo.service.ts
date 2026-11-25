import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CustodiasService } from './custodias.service';
import { CustodiasConfigService, type CampoGuia } from './custodias-config.service';
import { CustodiasGuiaService } from './custodias-guia.service';
import { CustodiaArchivosService } from './custodia-archivos.storage';
import { CustodiasCampoAuthService, type CelularAutenticado, type SesionAutenticada } from './custodias-campo-auth.service';
import { personasDelViaje } from './custodias-dispositivos.service';
import { leerJson } from './custodias-campo.util';
import { fotosPedidasDeViaje } from './custodias-fotos-pedidas.util';
import type { GuiaCustodia, ValorCampo } from './custodia-guia.types';
import {
  ETIQUETA_ROL,
  MAX_FIRMA_BYTES,
  MAX_FOTO_BYTES,
  MAX_ITEMS_EVENTOS,
  MAX_MINIATURA_BYTES,
  MOMENTOS_FIRMA_CAMPO,
  MOMENTOS_FOTO,
  ORIGENES_FOTO,
  TIPOS_EVENTO,
  TIPOS_NOVEDAD,
  claveFirma,
  claveFoto,
  decodificarBase64,
  errorDeHora,
  esClientUuid,
  esJpeg,
  esPng,
  fechaDe,
  latitud,
  longitud,
  precision,
  tokenSesionDeCabecera,
  texto,
  textoOpcional,
} from './custodias-campo-seguridad.util';

const MAX_FOTOS_POR_VIAJE = 300;
/** Lo que se tomó antes de la llegada pero llega tarde (sin señal) se acepta hasta este margen después de ella. */
const MARGEN_TRAS_LLEGADA_MS = 10 * 60_000;
/** Las observaciones sobre los datos del viaje se aceptan hasta un día después de la llegada. */
const MARGEN_OBSERVACION_MS = 24 * 3600_000;
const ENLACE_VIAJES = '/operaciones/viajes';

const ETIQUETA_NOVEDAD: Record<string, string> = {
  TRAFICO: 'Tráfico',
  RETEN: 'Retén',
  DESVIO: 'Desvío',
  AVERIA: 'Avería',
  ACCIDENTE: 'Accidente',
  OTRO: 'Otra novedad',
};

interface ViajeFila {
  id: number;
  companyId: number;
  numeroGuia: string;
  tipo: string;
  estado: string;
  createdAt: Date;
  updatedAt: Date;
  fechaHoraSalida: Date | null;
  fechaHoraLlegada: Date | null;
  rutaId: number | null;
  clienteId: number | null;
  guia: unknown;
}

interface EntradaEvento {
  clientUuid: string;
  tipo: string;
  ocurridoEn: Date;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  puntoId: number | null;
  texto: string | null;
  novedadTipo: string | null;
}

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const tieneValor = (v: ValorCampo | undefined): boolean =>
  v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Los campos obligatorios que llena el custodio y siguen vacíos (con su nombre y dónde), para exigirlos al llegar. */
export function camposFaltantes(guia: GuiaCustodia | null | undefined, tipo: string, campos: CampoGuia[]): string[] {
  const g = guia ?? {};
  const faltan: string[] = [];
  for (const c of campos) {
    if (!c.activo || !c.obligatorio || c.llenaQuien !== 'CUSTODIO') continue;
    if (c.tipoServicio !== tipo && c.tipoServicio !== 'TODOS') continue;
    const id = String(c.id);
    if (c.bloque === 'GENERAL') {
      if (!tieneValor(g.campos?.[id])) faltan.push(`«${c.nombre}»`);
    } else if (c.bloque === 'CONTENEDOR') {
      (g.contenedores ?? []).forEach((x, i) => {
        if (!tieneValor(x.campos?.[id])) faltan.push(`«${c.nombre}» (contenedor ${i + 1})`);
      });
    } else if (c.bloque === 'HACIENDA') {
      (g.haciendas ?? []).forEach((x, i) => {
        if (!tieneValor(x.campos?.[id])) faltan.push(`«${c.nombre}» (hacienda ${i + 1})`);
      });
    }
  }
  return faltan;
}

/** Un viaje terminado todavía acepta lo que se tomó durante el recorrido y llegó tarde por falta de señal. */
export function aceptaTrasLlegada(
  viaje: { estado: string; fechaHoraLlegada: Date | null; updatedAt: Date },
  instante: Date,
  margenMs: number = MARGEN_TRAS_LLEGADA_MS,
): boolean {
  if (viaje.estado !== 'LLEGO') return true;
  const llegada = (viaje.fechaHoraLlegada ?? viaje.updatedAt).getTime();
  return instante.getTime() <= llegada + margenMs;
}

/**
 * Lo que hace el celular del custodio (2026-11-24, Fase 2): ver su viaje, marcar salida/puntos/novedades/llegada,
 * subir fotos y firmas y completar datos de la guía. El servidor revalida TODO: la hora que vale es la del momento
 * en el celular, y cada elemento lleva un `clientUuid` para que reenviarlo no duplique nada.
 */
@Injectable()
export class CustodiasCampoService {
  private readonly logger = new Logger(CustodiasCampoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: CustodiasCampoAuthService,
    private readonly config: CustodiasConfigService,
    private readonly guias: CustodiasGuiaService,
    private readonly custodias: CustodiasService,
    private readonly archivos: CustodiaArchivosService,
    private readonly permissions: PermissionsService,
    private readonly notificaciones: NotificationsService,
  ) {}

  // ───────────────────────────── Estado y viaje ─────────────────────────────

  async estado(celular: CelularAutenticado, cabeceraSesion: unknown) {
    const viaje = await this.auth.viajeDelCelular(celular);
    const token = tokenSesionDeCabecera(cabeceraSesion);
    const sesion = token ? await this.auth.autenticarSesion(celular, token) : null;
    return {
      celular: { nombre: celular.nombre },
      viaje: viaje
        ? {
            id: viaje.id,
            numeroGuia: viaje.numeroGuia,
            tipo: viaje.tipoCustodia,
            estado: viaje.estado,
            cliente: (viaje.cliente ?? '').trim(),
          }
        : null,
      sesion: sesion ? { nombre: sesion.nombre, rol: sesion.rol } : null,
    };
  }

  private async cargarViaje(sesion: SesionAutenticada) {
    const viaje = await this.prisma.custodia.findFirst({ where: { id: sesion.custodiaId, companyId: sesion.companyId } });
    if (!viaje) throw this.auth.mensajeSesionInvalida();
    return viaje;
  }

  /** La vista RESTRINGIDA del viaje para el celular: sin cédulas, correos, montos ni otros viajes. */
  async viaje(sesion: SesionAutenticada) {
    const v = await this.cargarViaje(sesion);
    const guia = (esObjeto(v.guia) ? v.guia : {}) as GuiaCustodia;
    const tipo = String(v.tipoCustodia);

    const [ruta, cfg, firmaMomento, campos, eventos, fotos, firmas] = await Promise.all([
      this.guias.rutaDeViaje(sesion.companyId, v.rutaId),
      this.config.leerConfig(sesion.companyId),
      this.guias.firmaEfectiva(sesion.companyId, v.guia, v.clienteId),
      this.config.listarCampos(sesion.companyId, false),
      this.prisma.$queryRaw<
        {
          clientUuid: string;
          tipo: string;
          puntoId: number | null;
          novedadTipo: string | null;
          texto: string | null;
          ocurridoEn: Date;
          autorNombre: string | null;
        }[]
      >`
        SELECT "clientUuid", "tipo", "puntoId", "novedadTipo", "texto", "ocurridoEn", "autorNombre" FROM "CustodiaEvento"
        WHERE "custodiaId" = ${v.id} ORDER BY "ocurridoEn" ASC, "id" ASC`,
      this.prisma.$queryRaw<
        {
          clientUuid: string;
          momento: string;
          puntoId: number | null;
          eventoUuid: string | null;
          etiqueta: string | null;
          tomadaEn: Date;
        }[]
      >`
        SELECT "clientUuid", "momento", "puntoId", "eventoUuid", "etiqueta", "tomadaEn" FROM "CustodiaFoto"
        WHERE "custodiaId" = ${v.id} AND "borradaEn" IS NULL ORDER BY "tomadaEn" ASC, "id" ASC`,
      this.prisma.$queryRaw<{ momento: string; nombre: string; firmadaEn: Date }[]>`
        SELECT "momento", "nombre", "firmadaEn" FROM "CustodiaFirma"
        WHERE "custodiaId" = ${v.id} ORDER BY "firmadaEn" ASC`,
    ]);

    // La última marca de cada punto de la ruta.
    const marcas = new Map<number, Date>();
    for (const e of eventos) {
      if (e.tipo === 'PUNTO' && e.puntoId) marcas.set(e.puntoId, e.ocurridoEn);
    }

    return {
      id: v.id,
      numeroGuia: v.numeroGuia,
      tipo,
      estado: v.estado,
      // Para que el celular sepa desde cuándo vale la fecha de una foto de la galería.
      creadoEn: v.createdAt,
      fechaHoraSalida: v.fechaHoraSalida,
      fechaHoraLlegada: v.fechaHoraLlegada,
      cliente: { nombre: (v.cliente ?? '').trim() },
      contactoSitio: guia.contactoSitio ?? null,
      salida: { ciudad: v.ciudadSalida ?? '', direccion: v.direccionSalida ?? '' },
      llegada: { ciudad: v.ciudadLlegada ?? '', direccion: v.direccionLlegada ?? '' },
      patrulla: v.patrulla ?? '',
      placa: v.placa ?? '',
      // Sin cédulas: solo el puesto y el nombre.
      personal: personasDelViaje(v).map((p) => ({ rol: p.rol, etiqueta: ETIQUETA_ROL[p.rol], nombre: p.nombre })),
      ruta: ruta
        ? {
            nombre: ruta.nombre,
            puntos: ruta.puntos.map((p) => ({
              id: p.id,
              orden: p.orden,
              nombre: p.nombre,
              minutosDesdeAnterior: p.minutosDesdeAnterior,
              marcadoEn: marcas.get(p.id)?.toISOString() ?? null,
            })),
          }
        : null,
      guia: {
        campos: guia.campos ?? {},
        // Del chofer del cabezal y del furgón solo el nombre: la cédula se queda en la oficina.
        contenedores: (guia.contenedores ?? []).map((c) => ({
          numero: c.numero,
          choferNombre: c.choferNombre,
          placaCabezal: c.placaCabezal,
          guia: c.guia,
          lote: c.lote,
          cabina: c.cabina ?? null,
          campos: c.campos ?? {},
        })),
        furgon: guia.furgon ? { placa: guia.furgon.placa, choferNombre: guia.furgon.choferNombre } : null,
        haciendas: (guia.haciendas ?? []).map((h) => ({
          nombre: h.nombre,
          guia: h.guia,
          sacos: h.sacos,
          campos: h.campos ?? {},
        })),
      },
      campos: campos
        .filter((c) => c.activo && (c.tipoServicio === tipo || c.tipoServicio === 'TODOS'))
        .map((c) => ({
          id: c.id,
          bloque: c.bloque,
          nombre: c.nombre,
          tipo: c.tipo,
          opciones: c.opciones,
          obligatorio: c.obligatorio,
          llenaQuien: c.llenaQuien,
          esSello: c.esSello,
          orden: c.orden,
        })),
      firmaMomento,
      firmaObligatoria: cfg.firmaObligatoria,
      telefonoOperaciones: cfg.telefonoOperaciones,
      // Las fotos que se piden en este tipo de viaje, al salir y al llegar (la pantalla no las tiene escritas).
      fotosPedidas: fotosPedidasDeViaje(cfg.fotosPedidas, tipo),
      fotos: fotos.map((f) => ({
        clientUuid: f.clientUuid,
        momento: f.momento,
        puntoId: f.puntoId,
        eventoUuid: f.eventoUuid,
        etiqueta: f.etiqueta,
        tomadaEn: f.tomadaEn,
      })),
      firmas: firmas.map((f) => ({ momento: f.momento, nombre: f.nombre, firmadaEn: f.firmadaEn })),
      novedades: eventos
        .filter((e) => e.tipo === 'NOVEDAD')
        .map((e) => ({ clientUuid: e.clientUuid, novedadTipo: e.novedadTipo, texto: e.texto, ocurridoEn: e.ocurridoEn })),
      // Lo que el custodio avisó que está mal o distinto en los datos del viaje (solo para la oficina; no sale en el PDF).
      observaciones: eventos
        .filter((e) => e.tipo === 'OBSERVACION')
        .map((e) => ({ clientUuid: e.clientUuid, texto: e.texto, ocurridoEn: e.ocurridoEn, autorNombre: e.autorNombre })),
      // Puntos no previstos que el custodio anotó (sin punto de la ruta).
      puntosLibres: eventos
        .filter((e) => e.tipo === 'PUNTO' && !e.puntoId)
        .map((e) => ({ clientUuid: e.clientUuid, texto: e.texto, ocurridoEn: e.ocurridoEn })),
      soloLectura: v.estado === 'LLEGO',
    };
  }

  // ───────────────────────────── Eventos ─────────────────────────────

  private validarEvento(crudo: unknown): EntradaEvento {
    if (!esObjeto(crudo)) throw new BadRequestException('El registro no es válido.');
    if (!esClientUuid(crudo.clientUuid)) throw new BadRequestException('El registro no es válido.');
    const tipo = typeof crudo.tipo === 'string' ? crudo.tipo : '';
    if (!(TIPOS_EVENTO as readonly string[]).includes(tipo)) throw new BadRequestException('El tipo de registro no es válido.');
    const ocurridoEn = fechaDe(crudo.ocurridoEn);
    if (!ocurridoEn) throw new BadRequestException('La hora del registro no es válida.');
    let puntoId: number | null = null;
    if (crudo.puntoId !== undefined && crudo.puntoId !== null) {
      if (typeof crudo.puntoId !== 'number' || !Number.isInteger(crudo.puntoId) || crudo.puntoId <= 0) {
        throw new BadRequestException('El punto no es válido.');
      }
      puntoId = crudo.puntoId;
    }
    let novedadTipo: string | null = null;
    if (tipo === 'NOVEDAD') {
      novedadTipo = typeof crudo.novedadTipo === 'string' ? crudo.novedadTipo : '';
      if (!(TIPOS_NOVEDAD as readonly string[]).includes(novedadTipo)) {
        throw new BadRequestException('Elige el tipo de novedad.');
      }
    }
    const textoEvento = textoOpcional(crudo.texto, 500);
    if (tipo === 'OBSERVACION' && !textoEvento) throw new BadRequestException('Escribe la observación.');
    return {
      clientUuid: crudo.clientUuid,
      tipo,
      ocurridoEn,
      lat: latitud(crudo.lat),
      lng: longitud(crudo.lng),
      precisionM: precision(crudo.precisionM),
      puntoId,
      texto: textoEvento,
      novedadTipo,
    };
  }

  /** Procesa un lote de registros. Cada uno responde aparte; reenviar uno ya guardado responde ok sin duplicar. */
  async eventos(sesion: SesionAutenticada, cuerpo: unknown) {
    const items = esObjeto(cuerpo) ? cuerpo.items : undefined;
    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('No hay registros para guardar.');
    if (items.length > MAX_ITEMS_EVENTOS) {
      throw new BadRequestException(`Máximo ${MAX_ITEMS_EVENTOS} registros por envío.`);
    }

    // Se guardan en el orden en que pasaron (salida, puntos, llegada), no en el que llegaron.
    const orden: Record<string, number> = { SALIDA: 0, PUNTO: 1, NOVEDAD: 1, OBSERVACION: 1, LLEGADA: 2 };
    const preparados = items.map((crudo, indice) => {
      try {
        return { indice, ok: true as const, entrada: this.validarEvento(crudo), clientUuid: undefined as string | undefined };
      } catch (err) {
        const uuid = esObjeto(crudo) && typeof crudo.clientUuid === 'string' ? crudo.clientUuid : '';
        return { indice, ok: false as const, error: this.mensajeDe(err), clientUuid: uuid };
      }
    });
    const validos = preparados
      .filter((p): p is Extract<(typeof preparados)[number], { ok: true }> => p.ok)
      .sort(
        (a, b) =>
          a.entrada.ocurridoEn.getTime() - b.entrada.ocurridoEn.getTime() ||
          orden[a.entrada.tipo] - orden[b.entrada.tipo] ||
          a.indice - b.indice,
      );

    const contexto = await this.contextoDeEventos(sesion);
    const resultados = new Map<number, { clientUuid: string; ok: boolean; error?: string }>();
    for (const p of preparados) {
      if (!p.ok) resultados.set(p.indice, { clientUuid: p.clientUuid ?? '', ok: false, error: p.error });
    }
    for (const p of validos) {
      try {
        await this.procesarEvento(sesion, p.entrada, contexto);
        resultados.set(p.indice, { clientUuid: p.entrada.clientUuid, ok: true });
      } catch (err) {
        if (err instanceof HttpException && err.getStatus() < 500) {
          resultados.set(p.indice, { clientUuid: p.entrada.clientUuid, ok: false, error: this.mensajeDe(err) });
        } else {
          // Algo del servidor: no se responde «ok:false» (el celular lo quitaría de su cola); que reintente el lote.
          this.logger.error(`No se pudo guardar el registro ${p.entrada.clientUuid}: ${(err as Error).message}`);
          throw new ServiceUnavailableException('No se pudo guardar. Se reintentará más tarde.');
        }
      }
    }
    return { resultados: items.map((_, i) => resultados.get(i)!) };
  }

  private mensajeDe(err: unknown): string {
    if (err instanceof HttpException) {
      const r = err.getResponse();
      const m = typeof r === 'string' ? r : (r as { message?: unknown }).message;
      return Array.isArray(m) ? 'El registro no es válido.' : String(m ?? err.message);
    }
    return 'No se pudo guardar.';
  }

  /** Lo que se consulta una vez por lote: si la firma es obligatoria y cuándo, y los datos que debe llenar el custodio. */
  private async contextoDeEventos(sesion: SesionAutenticada) {
    const v = await this.cargarViaje(sesion);
    const [cfg, firmaMomento, campos] = await Promise.all([
      this.config.leerConfig(sesion.companyId),
      this.guias.firmaEfectiva(sesion.companyId, v.guia, v.clienteId),
      this.config.listarCampos(sesion.companyId, false),
    ]);
    return { firmaObligatoria: cfg.firmaObligatoria, firmaMomento, campos };
  }

  private async procesarEvento(
    sesion: SesionAutenticada,
    e: EntradaEvento,
    ctx: { firmaObligatoria: boolean; firmaMomento: string; campos: CampoGuia[] },
  ) {
    const aviso = await this.prisma.$transaction(async (tx) => {
      // El viaje se bloquea mientras se decide: dos envíos a la vez no pueden marcar dos veces la salida.
      const filas = await tx.$queryRaw<ViajeFila[]>`
        SELECT "id", "companyId", "numeroGuia", "tipoCustodia"::text AS "tipo", "estado"::text AS "estado",
               "createdAt", "updatedAt", "fechaHoraSalida", "fechaHoraLlegada", "rutaId", "clienteId", "guia"
        FROM "Custodia" WHERE "id" = ${sesion.custodiaId} AND "companyId" = ${sesion.companyId} FOR UPDATE`;
      const v = filas[0];
      if (!v) throw this.auth.mensajeSesionInvalida();

      const previo = await tx.$queryRaw<{ custodiaId: number }[]>`
        SELECT "custodiaId" FROM "CustodiaEvento" WHERE "clientUuid" = ${e.clientUuid}`;
      if (previo[0]) {
        if (previo[0].custodiaId !== v.id) throw new BadRequestException('Ese registro no corresponde a este viaje.');
        return null; // ya estaba guardado: repetirlo es ok
      }

      const errHora = errorDeHora(e.ocurridoEn, v.createdAt);
      if (errHora) throw new BadRequestException(errHora);
      // Con el viaje terminado solo se acepta una observación sobre sus datos, hasta un día después de la llegada.
      if (v.estado === 'LLEGO' && (e.tipo !== 'OBSERVACION' || !aceptaTrasLlegada(v, e.ocurridoEn, MARGEN_OBSERVACION_MS))) {
        throw new BadRequestException('El viaje ya terminó.');
      }

      let puntoNombre: string | null = null;
      let cambio: Record<string, any> | null = null;

      if (e.tipo === 'SALIDA') {
        if (v.estado !== 'LISTO_PARA_CUSTODIAR') throw new BadRequestException('El viaje ya salió.');
        if (ctx.firmaObligatoria && ['SALIDA', 'AMBOS'].includes(ctx.firmaMomento)) {
          if (!(await this.hayFirma(tx, v.id, 'SALIDA'))) throw new BadRequestException('Falta la firma de entrega en origen');
        }
        cambio = this.custodias.datosCambioEstado(v, 'EN_CAMINO', e.ocurridoEn.toISOString());
      } else if (e.tipo === 'PUNTO') {
        if (v.estado !== 'EN_CAMINO') throw new BadRequestException('Primero marca la salida del viaje.');
        if (e.puntoId) {
          puntoNombre = await this.nombreDePunto(tx, v.rutaId, e.puntoId);
          if (!puntoNombre) throw new BadRequestException('Ese punto no es de la ruta de este viaje.');
        } else if (!e.texto) {
          throw new BadRequestException('Escribe dónde estás para anotar un punto no previsto.');
        } else {
          puntoNombre = e.texto;
        }
      } else if (e.tipo === 'LLEGADA') {
        if (v.estado !== 'EN_CAMINO') throw new BadRequestException('Primero marca la salida del viaje.');
        if (ctx.firmaObligatoria && ['LLEGADA', 'AMBOS'].includes(ctx.firmaMomento)) {
          if (!(await this.hayFirma(tx, v.id, 'LLEGADA'))) throw new BadRequestException('Falta la firma de recepción en destino');
        }
        const guia = leerJson<GuiaCustodia>(v.guia, {});
        const faltan = camposFaltantes(guia, v.tipo, ctx.campos);
        if (faltan.length) throw new BadRequestException(`Faltan datos por completar: ${faltan.join(', ')}.`);
        cambio = this.custodias.datosCambioEstado(v, 'LLEGO', e.ocurridoEn.toISOString());
      } else if (e.tipo === 'NOVEDAD') {
        if (e.novedadTipo === 'OTRO' && !e.texto) throw new BadRequestException('Cuenta qué pasó en la novedad.');
      }

      await tx.$executeRaw`
        INSERT INTO "CustodiaEvento"
          ("custodiaId", "companyId", "clientUuid", "tipo", "puntoId", "puntoNombre", "novedadTipo", "texto",
           "ocurridoEn", "lat", "lng", "precisionM", "autorCedula", "autorNombre", "dispositivoId")
        VALUES (${v.id}, ${v.companyId}, ${e.clientUuid}, ${e.tipo}, ${e.puntoId}, ${puntoNombre}, ${e.novedadTipo},
                ${e.texto}, ${e.ocurridoEn}, ${e.lat}, ${e.lng}, ${e.precisionM}, ${sesion.cedula}, ${sesion.nombre},
                ${sesion.dispositivoId})
        ON CONFLICT ("clientUuid") DO NOTHING`;
      if (cambio) await tx.custodia.update({ where: { id: v.id }, data: cambio });

      if (e.tipo === 'NOVEDAD') return { clase: 'NOVEDAD' as const, guia: v.numeroGuia, tipo: e.novedadTipo!, texto: e.texto };
      if (e.tipo === 'OBSERVACION') return { clase: 'OBSERVACION' as const, guia: v.numeroGuia, tipo: '', texto: e.texto };
      return null;
    });

    if (aviso?.clase === 'NOVEDAD') await this.avisarNovedad(sesion, aviso);
    if (aviso?.clase === 'OBSERVACION') await this.avisarObservacion(sesion, aviso);
  }

  private async hayFirma(tx: { $queryRaw: PrismaService['$queryRaw'] }, custodiaId: number, momento: string) {
    const f = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "CustodiaFirma" WHERE "custodiaId" = ${custodiaId} AND "momento" = ${momento} LIMIT 1`;
    return f.length > 0;
  }

  private async nombreDePunto(tx: { $queryRaw: PrismaService['$queryRaw'] }, rutaId: number | null, puntoId: number) {
    if (!rutaId) return null;
    const f = await tx.$queryRaw<{ nombre: string }[]>`
      SELECT "nombre" FROM "CustodiaRutaPunto" WHERE "id" = ${puntoId} AND "rutaId" = ${rutaId}`;
    return f[0]?.nombre ?? null;
  }

  /** Aviso en la app a quienes pueden escribir en Operaciones. Si falla, el registro ya quedó guardado. */
  private async avisarNovedad(
    sesion: SesionAutenticada,
    n: { guia: string; tipo: string; texto: string | null },
  ) {
    try {
      const destinos = await this.permissions.getCompanyUserIdsWithWriteAccess(sesion.companyId, 'OPERACIONES');
      const detalle = n.texto ? ` — ${n.texto}` : '';
      for (const userId of destinos) {
        await this.notificaciones.create({
          userId,
          companyId: sesion.companyId,
          title: `Novedad en la custodia ${n.guia}`,
          message: `${sesion.nombre} reportó: ${ETIQUETA_NOVEDAD[n.tipo] ?? n.tipo}${detalle}`.slice(0, 600),
          link: ENLACE_VIAJES,
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar la novedad de la custodia ${n.guia}: ${(err as Error).message}`);
    }
  }

  /** Aviso en la app: el custodio dice que algo de los datos del viaje está mal o distinto. */
  private async avisarObservacion(sesion: SesionAutenticada, o: { guia: string; texto: string | null }) {
    try {
      const destinos = await this.permissions.getCompanyUserIdsWithWriteAccess(sesion.companyId, 'OPERACIONES');
      for (const userId of destinos) {
        await this.notificaciones.create({
          userId,
          companyId: sesion.companyId,
          title: `Observación del custodio en la custodia ${o.guia}`,
          message: `${sesion.nombre} dice: ${o.texto ?? ''}`.slice(0, 600),
          link: ENLACE_VIAJES,
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar la observación de la custodia ${o.guia}: ${(err as Error).message}`);
    }
  }

  // ───────────────────────────── Fotos ─────────────────────────────

  async subirFoto(
    sesion: SesionAutenticada,
    foto: ArchivoSubido | undefined,
    miniatura: ArchivoSubido | undefined,
    datosCrudo: unknown,
  ) {
    let datos: unknown = datosCrudo;
    if (typeof datosCrudo === 'string') {
      try {
        datos = JSON.parse(datosCrudo);
      } catch {
        throw new BadRequestException('Los datos de la foto no son válidos.');
      }
    }
    if (!esObjeto(datos)) throw new BadRequestException('Los datos de la foto no son válidos.');
    if (!esClientUuid(datos.clientUuid)) throw new BadRequestException('Los datos de la foto no son válidos.');
    const momento = typeof datos.momento === 'string' ? datos.momento : '';
    if (!(MOMENTOS_FOTO as readonly string[]).includes(momento)) throw new BadRequestException('El momento de la foto no es válido.');
    const tomadaEn = fechaDe(datos.tomadaEn);
    if (!tomadaEn) throw new BadRequestException('La hora de la foto no es válida.');
    let puntoId: number | null = null;
    if (datos.puntoId !== undefined && datos.puntoId !== null) {
      if (typeof datos.puntoId !== 'number' || !Number.isInteger(datos.puntoId) || datos.puntoId <= 0) {
        throw new BadRequestException('El punto de la foto no es válido.');
      }
      puntoId = datos.puntoId;
    }
    const eventoUuid = esClientUuid(datos.eventoUuid) ? datos.eventoUuid : null;
    // Sin dato (celular que aún no manda el origen) se entiende que fue con la cámara.
    let origen: string = 'CAMARA';
    if (datos.origen !== undefined && datos.origen !== null) {
      if (typeof datos.origen !== 'string' || !(ORIGENES_FOTO as readonly string[]).includes(datos.origen)) {
        throw new BadRequestException('El origen de la foto no es válido.');
      }
      origen = datos.origen;
    }

    const v = await this.cargarViaje(sesion);
    let tomadaEfectiva = tomadaEn;
    // La fecha de una foto de la galería es la del archivo y puede ser muy vieja: si es anterior al viaje se usa la de ahora.
    if (origen === 'GALERIA' && tomadaEn.getTime() < v.createdAt.getTime() - 24 * 3600_000) tomadaEfectiva = new Date();
    const errHora = errorDeHora(tomadaEfectiva, v.createdAt);
    if (errHora) throw new BadRequestException(errHora);
    if (!aceptaTrasLlegada(v, tomadaEfectiva)) throw new BadRequestException('El viaje ya terminó.');
    if (puntoId && !(await this.nombreDePunto(this.prisma, v.rutaId, puntoId))) {
      throw new BadRequestException('Ese punto no es de la ruta de este viaje.');
    }

    // Reenviar una foto ya guardada no la duplica.
    const previo = await this.prisma.$queryRaw<{ custodiaId: number }[]>`
      SELECT "custodiaId" FROM "CustodiaFoto" WHERE "clientUuid" = ${datos.clientUuid}`;
    if (previo[0]) {
      if (previo[0].custodiaId !== v.id) throw new BadRequestException('Esa foto no corresponde a este viaje.');
      return { ok: true };
    }
    const total = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS "n" FROM "CustodiaFoto" WHERE "custodiaId" = ${v.id}`;
    if ((total[0]?.n ?? 0) >= MAX_FOTOS_POR_VIAJE) {
      throw new BadRequestException('Se alcanzó el máximo de fotos de este viaje.');
    }

    if (!foto || !miniatura) throw new BadRequestException('Falta la foto o su miniatura.');
    if (foto.size > MAX_FOTO_BYTES || !esJpeg(foto.buffer)) throw new BadRequestException('La foto debe ser una imagen JPEG de hasta 1,5 MB.');
    if (miniatura.size > MAX_MINIATURA_BYTES || !esJpeg(miniatura.buffer)) {
      throw new BadRequestException('La miniatura debe ser una imagen JPEG de hasta 200 KB.');
    }

    const claveArchivo = claveFoto(v.companyId, v.id, datos.clientUuid, false);
    const claveMiniatura = claveFoto(v.companyId, v.id, datos.clientUuid, true);
    try {
      await this.archivos.guardar(claveArchivo, foto.buffer, 'image/jpeg');
      await this.archivos.guardar(claveMiniatura, miniatura.buffer, 'image/jpeg');
    } catch (err) {
      this.logger.error(`No se pudo guardar la foto ${datos.clientUuid}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo guardar la foto. Se reintentará más tarde.');
    }
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaFoto"
        ("custodiaId", "companyId", "clientUuid", "momento", "puntoId", "eventoUuid", "etiqueta", "comentario",
         "claveArchivo", "claveMiniatura", "contentType", "bytes", "bytesMiniatura", "tomadaEn", "lat", "lng",
         "precisionM", "autorCedula", "autorNombre", "dispositivoId", "origen")
      VALUES (${v.id}, ${v.companyId}, ${datos.clientUuid}, ${momento}, ${puntoId}, ${eventoUuid},
              ${textoOpcional(datos.etiqueta, 60)}, ${textoOpcional(datos.comentario, 500)},
              ${claveArchivo}, ${claveMiniatura}, 'image/jpeg', ${foto.size}, ${miniatura.size}, ${tomadaEfectiva},
              ${latitud(datos.lat)}, ${longitud(datos.lng)}, ${precision(datos.precisionM)},
              ${sesion.cedula}, ${sesion.nombre}, ${sesion.dispositivoId}, ${origen})
      ON CONFLICT ("clientUuid") DO NOTHING`;
    return { ok: true };
  }

  // ───────────────────────────── Firmas ─────────────────────────────

  async subirFirma(sesion: SesionAutenticada, cuerpo: unknown) {
    if (!esObjeto(cuerpo) || !esClientUuid(cuerpo.clientUuid)) throw new BadRequestException('La firma no es válida.');
    const momento = typeof cuerpo.momento === 'string' ? cuerpo.momento : '';
    if (!(MOMENTOS_FIRMA_CAMPO as readonly string[]).includes(momento)) throw new BadRequestException('El momento de la firma no es válido.');
    const nombre = texto(cuerpo.nombre, 120);
    if (!nombre) throw new BadRequestException('Escribe el nombre de quien firma.');
    const cedula = texto(cuerpo.cedula, 30);
    const firmadaEn = fechaDe(cuerpo.firmadaEn);
    if (!firmadaEn) throw new BadRequestException('La hora de la firma no es válida.');
    const imagen = decodificarBase64(cuerpo.imagenPng, MAX_FIRMA_BYTES);
    if (!imagen || !esPng(imagen)) throw new BadRequestException('La imagen de la firma no es válida o es muy grande.');

    const v = await this.cargarViaje(sesion);
    const errHora = errorDeHora(firmadaEn, v.createdAt);
    if (errHora) throw new BadRequestException(errHora);
    if (!aceptaTrasLlegada(v, firmadaEn)) throw new BadRequestException('El viaje ya terminó.');

    const uuid = cuerpo.clientUuid;
    const otra = await this.prisma.$queryRaw<{ custodiaId: number }[]>`
      SELECT "custodiaId" FROM "CustodiaFirma" WHERE "clientUuid" = ${uuid}`;
    if (otra[0]) {
      if (otra[0].custodiaId !== v.id) throw new BadRequestException('Esa firma no corresponde a este viaje.');
      return { ok: true };
    }
    const existentes = await this.prisma.$queryRaw<{ id: number; claveImagen: string; firmadaEn: Date }[]>`
      SELECT "id", "claveImagen", "firmadaEn" FROM "CustodiaFirma" WHERE "custodiaId" = ${v.id} AND "momento" = ${momento}`;
    // Un reenvío atrasado de una firma vieja no pisa a la más nueva.
    if (existentes.some((x) => x.firmadaEn.getTime() > firmadaEn.getTime())) return { ok: true };

    const clave = claveFirma(v.companyId, v.id, uuid);
    try {
      await this.archivos.guardar(clave, imagen, 'image/png');
    } catch (err) {
      this.logger.error(`No se pudo guardar la firma ${uuid}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo guardar la firma. Se reintentará más tarde.');
    }
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaFirma"
        ("custodiaId", "companyId", "clientUuid", "momento", "nombre", "cedula", "claveImagen", "firmadaEn", "lat",
         "lng", "autorCedula", "autorNombre", "dispositivoId")
      VALUES (${v.id}, ${v.companyId}, ${uuid}, ${momento}, ${nombre}, ${cedula}, ${clave}, ${firmadaEn},
              ${latitud(cuerpo.lat)}, ${longitud(cuerpo.lng)}, ${sesion.cedula}, ${sesion.nombre}, ${sesion.dispositivoId})
      ON CONFLICT ("clientUuid") DO NOTHING`;
    // Una firma por momento: la nueva reemplaza a la anterior (su fila y su imagen).
    for (const vieja of existentes) {
      await this.prisma.$executeRaw`DELETE FROM "CustodiaFirma" WHERE "id" = ${vieja.id}`;
      await this.archivos
        .borrar(vieja.claveImagen)
        .catch((err) => this.logger.warn(`No se pudo borrar la firma anterior: ${(err as Error).message}`));
    }
    return { ok: true };
  }

  // ───────────────────────────── Datos de la guía ─────────────────────────────

  /** El custodio completa SOLO los campos que la configuración le asigna; lo demás lo completa la oficina. */
  async completarGuia(sesion: SesionAutenticada, cuerpo: unknown) {
    const cambios = esObjeto(cuerpo) ? cuerpo.cambios : undefined;
    if (!Array.isArray(cambios) || cambios.length === 0) throw new BadRequestException('No hay datos para guardar.');
    if (cambios.length > 100) throw new BadRequestException('Son demasiados datos a la vez.');

    const campos = await this.config.listarCampos(sesion.companyId, true);
    const porId = new Map(campos.map((c) => [String(c.id), c]));
    const v = await this.cargarViaje(sesion);
    const tipo = String(v.tipoCustodia);
    if (v.estado === 'LLEGO') throw new BadRequestException('El viaje ya terminó.');

    // Primero se revisan todos (un dato ajeno rechaza el envío completo); luego se aplican.
    const revisados = cambios.map((c) => {
      if (!esObjeto(c)) throw new BadRequestException('Un dato no es válido.');
      const bloque = typeof c.bloque === 'string' ? c.bloque : '';
      if (!['GENERAL', 'CONTENEDOR', 'HACIENDA'].includes(bloque)) throw new BadRequestException('Un dato no es válido.');
      const campo = typeof c.campoId === 'string' || typeof c.campoId === 'number' ? porId.get(String(c.campoId)) : undefined;
      if (!campo) throw new BadRequestException('Un dato no es válido.');
      if (
        !campo.activo ||
        campo.llenaQuien !== 'CUSTODIO' ||
        campo.bloque !== bloque ||
        (campo.tipoServicio !== tipo && campo.tipoServicio !== 'TODOS')
      ) {
        throw new ForbiddenException('Ese dato lo completa la oficina');
      }
      let indice: number | null = null;
      if (bloque !== 'GENERAL') {
        if (typeof c.indice !== 'number' || !Number.isInteger(c.indice) || c.indice < 0) {
          throw new BadRequestException('Un dato no es válido.');
        }
        indice = c.indice;
      }
      const valor = this.guias.valorDeCampo(campo, c.valor === undefined ? null : c.valor) ?? null;
      if (campo.tipo === 'LISTA' && typeof valor === 'string' && valor && !campo.opciones.includes(valor)) {
        throw new BadRequestException(`«${campo.nombre}»: elige una de las opciones.`);
      }
      return { campo, bloque, indice, valor };
    });

    await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ guia: unknown }[]>`
        SELECT "guia" FROM "Custodia" WHERE "id" = ${v.id} AND "companyId" = ${sesion.companyId} FOR UPDATE`;
      if (!filas[0]) throw new NotFoundException('Viaje no encontrado.');
      const guia = leerJson<GuiaCustodia>(filas[0].guia, {});
      guia.campos = guia.campos ?? {};
      guia.etiquetas = guia.etiquetas ?? {};
      for (const r of revisados) {
        const id = String(r.campo.id);
        if (r.bloque === 'GENERAL') {
          guia.campos[id] = r.valor;
        } else if (r.bloque === 'CONTENEDOR') {
          const destino = guia.contenedores?.[r.indice!];
          if (!destino) throw new BadRequestException('Ese contenedor no existe en el viaje.');
          destino.campos = { ...(destino.campos ?? {}), [id]: r.valor };
        } else {
          const destino = guia.haciendas?.[r.indice!];
          if (!destino) throw new BadRequestException('Esa hacienda no existe en el viaje.');
          destino.campos = { ...(destino.campos ?? {}), [id]: r.valor };
        }
        // La foto de la etiqueta, para que el viaje se lea igual aunque luego se renombre el campo.
        guia.etiquetas[id] = guia.etiquetas[id] ?? {
          nombre: r.campo.nombre,
          tipo: r.campo.tipo,
          bloque: r.campo.bloque,
          enPdf: r.campo.enPdf,
          esSello: r.campo.esSello,
          orden: r.campo.orden,
        };
      }
      await tx.$executeRaw`
        UPDATE "Custodia" SET "guia" = ${JSON.stringify(guia)}::jsonb, "updatedAt" = now() WHERE "id" = ${v.id}`;
    });
    return { ok: true };
  }
}
