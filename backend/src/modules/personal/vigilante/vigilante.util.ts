/**
 * Lógica pura del vigilante de vencimientos de RRHH (sin base de datos, sin IA): decide qué
 * documentos de guardias merecen aviso HOY y arma el texto del resumen. Los días son días de
 * Ecuador (medianoche UTC, como `hoyEcuador`); aquí `hoy` y `vence` ya llegan así.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

export interface DocumentoVigilado {
  cedula: string;
  guardia: string;
  entidad: string;
  documento: string;
  /** Día de vencimiento (medianoche UTC) o null si el documento no tiene fecha cargada. */
  vence: Date | null;
}

export interface ConfigVigilante {
  activo: boolean;
  avisarDias: number[];
  repetirVencidoDias: number;
  resumenLunes: boolean;
}

export const CONFIG_VIGILANTE_POR_DEFECTO: ConfigVigilante = {
  activo: true,
  avisarDias: [30, 7, 0],
  repetirVencidoDias: 7,
  resumenLunes: true,
};

export const TITULO_AVISO_VENCIMIENTOS = 'Vencimientos de documentos';
export const ENLACE_AVISO_VENCIMIENTOS = '/rrhh/cumplimiento';

/** Máximos aceptados al guardar (la pantalla los valida igual). */
export const MAX_PLAZOS = 8;
export const MAX_DIAS_PLAZO = 365;
export const MAX_REPETIR_DIAS = 60;

export interface ItemVigilado extends DocumentoVigilado {
  /** Días que faltan (0 = vence hoy, negativo = ya venció). */
  dias: number;
}

export interface ResumenVigilante {
  /** Vencidos que hoy tocan avisar (el primer día vencido y luego cada N días). */
  vencidos: ItemVigilado[];
  /** Vencen hoy. */
  vencenHoy: ItemVigilado[];
  /** Cruzan hoy uno de los plazos (faltan N días). */
  porVencer: ItemVigilado[];
  /** Documentos con fecha de vencimiento sin cargar: no se pueden vigilar. */
  sinFecha: DocumentoVigilado[];
  /** Todo lo vencido hoy (aunque no toque avisar). Solo se usa en el resumen completo. */
  vencidosTotal: number;
  /** Requisitos que el guardia todavía no entregó (el semáforo los marca en rojo). */
  faltantes: DocumentoFaltante[];
  /** Es el resumen completo (lunes o prueba): incluye lo que sigue pendiente aunque hoy no cruce un plazo. */
  esResumen: boolean;
}

/** Un documento que falta no tiene fecha de vencimiento. */
export type DocumentoFaltante = Omit<DocumentoVigilado, 'vence'>;

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_DIA);
}

/** Lunes = 1 (la fecha ya es el día de Ecuador a medianoche UTC, así que getUTCDay es el día correcto). */
export function esLunes(hoy: Date): boolean {
  return hoy.getUTCDay() === 1;
}

/** Normaliza lo que llega de la pantalla: enteros únicos, de mayor a menor, dentro de los límites. */
export function normalizarPlazos(plazos: unknown): number[] {
  if (!Array.isArray(plazos)) return [];
  const limpios = plazos
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_DIAS_PLAZO);
  return [...new Set(limpios)].sort((a, b) => b - a).slice(0, MAX_PLAZOS);
}

/**
 * Qué documentos tocan hoy. Sin estado guardado: un documento avisa el día exacto en que le
 * faltan N días (cada N de `avisarDias`), y ya vencido, el primer día y luego cada
 * `repetirVencidoDias`. Así no hace falta recordar qué se avisó y repetir la corrida el mismo día
 * no cambia el resultado.
 */
export function resumirVigilancia(
  documentos: DocumentoVigilado[],
  config: ConfigVigilante,
  hoy: Date,
  opciones: { faltantes?: DocumentoFaltante[]; forzarResumen?: boolean } = {},
): ResumenVigilante {
  const resumen: ResumenVigilante = {
    vencidos: [],
    vencenHoy: [],
    porVencer: [],
    sinFecha: [],
    vencidosTotal: 0,
    faltantes: opciones.faltantes ?? [],
    esResumen: opciones.forzarResumen === true || esLunes(hoy),
  };
  const plazos = new Set(config.avisarDias);

  for (const d of documentos) {
    if (!d.vence) {
      resumen.sinFecha.push(d);
      continue;
    }
    const dias = diasEntre(hoy, d.vence);
    const item: ItemVigilado = { ...d, dias };
    if (dias < 0) {
      resumen.vencidosTotal++;
      const repetir = config.repetirVencidoDias;
      const diasVencido = -dias; // 1 = venció ayer
      if (diasVencido === 1 || (repetir > 0 && (diasVencido - 1) % repetir === 0)) {
        resumen.vencidos.push(item);
      }
    } else if (dias === 0) {
      if (plazos.has(0)) resumen.vencenHoy.push(item);
    } else if (plazos.has(dias)) {
      resumen.porVencer.push(item);
    }
  }
  return resumen;
}

/** ¿Hoy hay algo que avisar? (el lunes, además, el resumen de lo pendiente). */
export function hayAviso(r: ResumenVigilante, config: ConfigVigilante): boolean {
  const eventos = r.vencidos.length + r.vencenHoy.length + r.porVencer.length > 0;
  if (eventos) return true;
  return (
    config.resumenLunes &&
    r.esResumen &&
    (r.vencidosTotal > 0 || r.sinFecha.length > 0 || r.faltantes.length > 0)
  );
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function ejemplos(items: DocumentoFaltante[], max = 3): string {
  const nombres = items.slice(0, max).map((i) => `${i.guardia} (${i.documento})`);
  const resto = items.length - nombres.length;
  return nombres.join(', ') + (resto > 0 ? ` y ${resto} más` : '');
}

/** Texto del aviso de la campana: corto, con los números y unos pocos nombres. */
export function mensajeDelResumen(r: ResumenVigilante, config: ConfigVigilante): string {
  const lineas: string[] = [];
  if (r.vencidos.length > 0) {
    lineas.push(`Vencidos: ${plural(r.vencidos.length, 'documento', 'documentos')} — ${ejemplos(r.vencidos)}.`);
  } else if (r.esResumen && r.vencidosTotal > 0) {
    lineas.push(`Siguen vencidos: ${plural(r.vencidosTotal, 'documento', 'documentos')}.`);
  }
  if (r.vencenHoy.length > 0) {
    lineas.push(`Vencen hoy: ${plural(r.vencenHoy.length, 'documento', 'documentos')} — ${ejemplos(r.vencenHoy)}.`);
  }
  if (r.porVencer.length > 0) {
    const cerca = Math.min(...r.porVencer.map((i) => i.dias));
    lineas.push(
      `Por vencer: ${plural(r.porVencer.length, 'documento', 'documentos')} (el más cercano en ${plural(cerca, 'día', 'días')}) — ${ejemplos(r.porVencer)}.`,
    );
  }
  if (r.sinFecha.length > 0) {
    lineas.push(
      `Sin fecha cargada: ${plural(r.sinFecha.length, 'documento', 'documentos')} — no se pueden vigilar hasta que RRHH cargue su fecha de vencimiento.`,
    );
  }
  if (r.faltantes.length > 0 && (r.esResumen || lineas.length > 0)) {
    const guardias = new Set(r.faltantes.map((f) => f.cedula)).size;
    lineas.push(
      `Documentos faltantes: ${plural(r.faltantes.length, 'documento', 'documentos')} en ${plural(guardias, 'guardia', 'guardias')} (aún no los entregan).`,
    );
  }
  return lineas.join('\n');
}
