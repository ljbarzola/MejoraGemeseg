// Ciclo mensual de un contrato en la web: copia chica de backend/src/modules/contratacion-publica/shared/ciclo.util.ts
// (mantener las dos iguales). Con día de corte 24, el ciclo de septiembre va del 24 de agosto al 23 de septiembre
// y se llama «septiembre» (por el mes en que termina). Sin corte, o con 1, es el mes calendario.

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export interface CicloMensual {
  desde: string;
  hasta: string;
  esCiclo: boolean;
}

export function cicloDelMes(anio: number, mes: number, diaCorte: number | null | undefined): CicloMensual {
  if (!diaCorte || !Number.isInteger(diaCorte) || diaCorte < 2 || diaCorte > 31) {
    return { desde: iso(anio, mes, 1), hasta: iso(anio, mes, diasDelMes(anio, mes)), esCiclo: false };
  }
  const anioPrev = mes === 1 ? anio - 1 : anio;
  const mesPrev = mes === 1 ? 12 : mes - 1;
  return {
    desde: iso(anioPrev, mesPrev, Math.min(diaCorte, diasDelMes(anioPrev, mesPrev))),
    hasta: iso(anio, mes, Math.min(diaCorte - 1, diasDelMes(anio, mes))),
    esCiclo: true,
  };
}

const sumarDia = (fechaIso: string) => new Date(Date.parse(`${fechaIso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Las fechas que se proponen para el próximo horario de un contrato: el ciclo que sigue al último horario
 * (o, si no hay ninguno, el ciclo en que cae hoy). Solo propone: la persona puede cambiarlas.
 */
export function proponerCiclo(
  diaCorte: number | null | undefined,
  ultimoFin: string | null,
  hoy: string,
): { desde: string; hasta: string } {
  const referencia = ultimoFin ? sumarDia(ultimoFin) : hoy;
  const [a, m, d] = referencia.split('-').map(Number);
  const conCorte = !!diaCorte && diaCorte >= 2 && diaCorte <= 31;
  // El ciclo que empieza el día de corte del mes anterior termina en el mes siguiente a la fecha de referencia
  // si esta ya pasó el corte; si no, termina en su mismo mes.
  const terminaEnSiguiente = conCorte && d >= (diaCorte as number);
  const mesFin = terminaEnSiguiente ? (m === 12 ? 1 : m + 1) : m;
  const anioFin = terminaEnSiguiente && m === 12 ? a + 1 : a;
  const c = cicloDelMes(anioFin, mesFin, conCorte ? diaCorte : null);
  // Con un horario anterior, el nuevo empieza justo al día siguiente de su fin (aunque ese horario no haya
  // cerrado un ciclo completo); así nunca se cruzan. Solo el fin sale del ciclo.
  return { desde: ultimoFin ? referencia : c.desde, hasta: c.hasta };
}
