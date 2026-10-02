// Funciones puras del seguimiento de entregas: fechas y estados. Sin acceso a
// base de datos para poder probarlas directo.

export const ESTADOS_ENTREGA = [
  'PENDIENTE',
  'ENTREGADO',
  'APROBADO',
  'RECHAZADO',
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const DIAS_AVISO_PREVIO = 3;
export const ZONA_HORARIA = 'America/Guayaquil';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

/** Convierte 'YYYY-MM-DD' en Date a medianoche UTC (así se guarda un @db.Date). */
export function fechaDesdeTexto(texto: string): Date {
  const [y, m, d] = texto.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 'YYYY-MM-DD' de una fecha ya guardada (medianoche UTC). */
export function textoDesdeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** La fecha de "hoy" en Ecuador, como medianoche UTC, para compararla con @db.Date. */
export function hoyEcuador(ahora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  return fechaDesdeTexto(partes);
}

const MS_DIA = 24 * 60 * 60 * 1000;

/** Días enteros desde `desde` hasta `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_DIA);
}

/** Último día del mes (mes 1-12). */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Lleva una fecha límite del mes anterior a la solicitud de otro mes: mismo
 * día del mes, o el último si ese mes es más corto (el 31 pasa al 28/30).
 */
export function trasladarFechaAMes(
  fecha: Date,
  anio: number,
  mes: number,
): Date {
  const dia = Math.min(fecha.getUTCDate(), ultimoDiaDelMes(anio, mes));
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Una entrega vence (ya pasó su fecha) solo si todavía falta algo por hacer. */
export function estaVencida(
  estado: string,
  fechaLimite: Date,
  hoy: Date = hoyEcuador(),
): boolean {
  if (estado === 'APROBADO' || estado === 'ENTREGADO') return false;
  return diasEntre(hoy, fechaLimite) < 0;
}

/**
 * ¿Toca recordar hoy? Solo cuando faltan DIAS_AVISO_PREVIO días o es el día
 * del vencimiento, y nunca dos veces en el mismo día.
 */
export function tocaRecordatorio(
  estado: string,
  fechaLimite: Date,
  ultimoRecordatorioAt: Date | null,
  hoy: Date = hoyEcuador(),
): boolean {
  if (estado !== 'PENDIENTE' && estado !== 'RECHAZADO') return false;
  const dias = diasEntre(hoy, fechaLimite);
  if (dias !== DIAS_AVISO_PREVIO && dias !== 0) return false;
  if (
    ultimoRecordatorioAt &&
    hoyEcuador(ultimoRecordatorioAt).getTime() === hoy.getTime()
  ) {
    return false;
  }
  return true;
}

/** '25/09/2026' para mostrarle una fecha a una persona. */
export function formatoFecha(fecha: Date): string {
  const [y, m, d] = textoDesdeFecha(fecha).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Id del archivo de Drive dentro de un enlace de Drive (`/file/d/<id>/...` o
 * `?id=<id>`). Devuelve null si no es un enlace de archivo de Drive.
 */
export function extraerIdArchivoDrive(url: string): string | null {
  const m =
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/.exec(url) ??
    /[?&]id=([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}
