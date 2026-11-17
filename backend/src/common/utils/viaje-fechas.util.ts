// Fechas de un viaje de custodia (2026-11-16). Compartido por Custodias y Contabilidad para que los dos
// módulos cuenten un viaje en el MISMO día y mes: el día de Ecuador (UTC-5) de su salida o, si no tiene
// hora de salida, el de su registro.

const HORAS_ECUADOR_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Día de Ecuador (UTC-5) de un instante, como YYYY-MM-DD. */
export function diaEcuador(fecha: Date): string {
  return new Date(fecha.getTime() - HORAS_ECUADOR_MS).toISOString().slice(0, 10);
}

/** La fecha que cuenta de un viaje: la de salida y, si falta, la de registro. */
export function fechaDeViaje(c: { fechaHoraSalida: Date | null; createdAt: Date }): Date {
  return c.fechaHoraSalida ?? c.createdAt;
}

/** Mes (YYYY-MM) de Ecuador al que pertenece un viaje. */
export function mesDeViaje(c: { fechaHoraSalida: Date | null; createdAt: Date }): string {
  return diaEcuador(fechaDeViaje(c)).slice(0, 7);
}

/** Rango de instantes que cubre desde el día `desde` hasta el día `hasta` (ambos incluidos, hora de Ecuador). */
export function rangoDiasEcuador(desde?: string, hasta?: string): { gte?: Date; lte?: Date } {
  const r: { gte?: Date; lte?: Date } = {};
  if (desde) r.gte = new Date(new Date(`${desde}T00:00:00.000Z`).getTime() + HORAS_ECUADOR_MS);
  if (hasta) r.lte = new Date(new Date(`${hasta}T00:00:00.000Z`).getTime() + DIA_MS + HORAS_ECUADOR_MS - 1);
  return r;
}

/** Condición de Prisma: viajes cuya fecha (salida o, si falta, registro) cae en el rango. Sin rango no filtra. */
export function dondeFechaViaje(rango: { gte?: Date; lte?: Date }): Record<string, unknown> {
  if (!rango.gte && !rango.lte) return {};
  return { OR: [{ fechaHoraSalida: rango }, { fechaHoraSalida: null, createdAt: rango }] };
}

export const esMesValido = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** Mes actual de Ecuador (YYYY-MM). */
export function mesActualEcuador(): string {
  return diaEcuador(new Date()).slice(0, 7);
}

/** Primer y último día (YYYY-MM-DD) de un mes YYYY-MM. */
export function diasDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** Los `n` meses que terminan en `mes` (incluido), del más viejo al más nuevo. */
export function ultimosMeses(mes: string, n: number): string[] {
  const [y, m] = mes.split('-').map(Number);
  const r: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    r.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return r;
}

/** «nov 26» para 2026-11. */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
}
