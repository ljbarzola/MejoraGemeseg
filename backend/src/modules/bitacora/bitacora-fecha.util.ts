/**
 * Días de la Bitácora = días de Ecuador (UTC-5, sin horario de verano). Nunca se
 * compara el día UTC de una marca de tiempo: un evento de las 20:00 en Guayaquil
 * ya es del día siguiente en UTC.
 */
export const ZONA_ECUADOR = 'America/Guayaquil';
const DESFASE_HORAS = 5;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaValida(fecha: string): boolean {
  if (!FECHA_RE.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00-05:00`);
  return !Number.isNaN(d.getTime()) && hoyEcuador(d) === fecha;
}

/** Día (AAAA-MM-DD) que marca el reloj de Ecuador en el instante dado. */
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - DESFASE_HORAS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/** Suma (o resta) días a un día AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Minutos transcurridos desde las 00:00 de Ecuador del día de ese instante (0 a 1439). */
export function minutosDelDia(instante: Date): number {
  const local = instante.getTime() - DESFASE_HORAS * 3_600_000;
  return Math.floor(
    (((local % 86_400_000) + 86_400_000) % 86_400_000) / 60_000,
  );
}

/** Desde las 00:00 (incluida) hasta las 00:00 del día siguiente (excluida), hora de Ecuador. */
export function rangoDia(fecha: string): { desde: Date; hasta: Date } {
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  return { desde, hasta: new Date(desde.getTime() + 24 * 3_600_000) };
}
