export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MS_POR_DIA = 86400000;

/** 'YYYY-MM-DD' -> timestamp UTC medianoche, sin corrimiento de zona horaria. */
export function parseFechaUTC(fecha: string | Date): number {
  if (fecha instanceof Date) {
    return Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
    );
  }
  const [anio, mes, dia] = fecha
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  return Date.UTC(anio, mes - 1, dia);
}

export function formatFechaISO(timestamp: number): string {
  const d = new Date(timestamp);
  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Lista ordenada de fechas 'YYYY-MM-DD' entre fechaInicio y fechaFin (ambas inclusive). */
export function listaFechasEnRango(
  fechaInicio: string | Date,
  fechaFin: string | Date,
): string[] {
  const inicio = parseFechaUTC(fechaInicio);
  const fin = parseFechaUTC(fechaFin);
  const fechas: string[] = [];
  for (let ts = inicio; ts <= fin; ts += MS_POR_DIA) {
    fechas.push(formatFechaISO(ts));
  }
  return fechas;
}

/** "30 DE JULIO DE 2026 AL 29 DE AGOSTO DE 2026" */
export function formatRangoFechas(
  fechaInicio: string | Date,
  fechaFin: string | Date,
): string {
  const inicioTs = parseFechaUTC(fechaInicio);
  const finTs = parseFechaUTC(fechaFin);
  const inicioD = new Date(inicioTs);
  const finD = new Date(finTs);
  const fmt = (d: Date) =>
    `${d.getUTCDate()} DE ${MESES[d.getUTCMonth()].toUpperCase()} DE ${d.getUTCFullYear()}`;
  return `${fmt(inicioD)} AL ${fmt(finD)}`;
}

/** "30 jul" — encabezado corto de columna para grillas/PDF/Excel. */
export function formatFechaCorta(fecha: string): string {
  const ts = parseFechaUTC(fecha);
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3).toLowerCase()}`;
}
