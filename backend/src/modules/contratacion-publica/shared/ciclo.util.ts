/**
 * Ciclo de facturación e informe de un contrato. Muchos contratos no van por mes calendario sino de un
 * día de corte al siguiente («del 24 de agosto al 23 de septiembre»). El ciclo se NOMBRA por el mes en
 * que termina: el del 24 de agosto al 23 de septiembre es el de septiembre (así firman el informe).
 *
 * Con día de corte 1 (o sin día de corte) el ciclo es el mes calendario. Funciones puras, sin base de datos.
 */

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface CicloMensual {
  /** AAAA-MM-DD */
  desde: string;
  hasta: string;
  /** false si es el mes calendario completo. */
  esCiclo: boolean;
}

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Un día de corte válido es un entero de 1 a 31; cualquier otra cosa se trata como «sin corte». */
export const corteValido = (dia: unknown): dia is number =>
  typeof dia === 'number' && Number.isInteger(dia) && dia >= 1 && dia <= 31;

/**
 * El ciclo que TERMINA en `mes` de `anio`, con corte en `diaCorte`: empieza el día de corte del mes
 * anterior y termina el día anterior al corte de este mes. Un día que el mes no tiene (31 en un mes
 * de 30) se ajusta al último del mes.
 */
export function cicloDelMes(anio: number, mes: number, diaCorte: number | null | undefined): CicloMensual {
  if (!corteValido(diaCorte) || diaCorte === 1) {
    return { desde: iso(anio, mes, 1), hasta: iso(anio, mes, diasDelMes(anio, mes)), esCiclo: false };
  }
  const anioPrev = mes === 1 ? anio - 1 : anio;
  const mesPrev = mes === 1 ? 12 : mes - 1;
  const inicio = Math.min(diaCorte, diasDelMes(anioPrev, mesPrev));
  const fin = Math.min(diaCorte - 1, diasDelMes(anio, mes));
  return { desde: iso(anioPrev, mesPrev, inicio), hasta: iso(anio, mes, fin), esCiclo: true };
}

/** «24 ago – 23 sep» (con el año solo si cruza de año: «24 dic 2026 – 23 ene 2027»). */
export function cicloTextoCorto(c: CicloMensual): string {
  const [a1, m1, d1] = c.desde.split('-').map(Number);
  const [a2, m2, d2] = c.hasta.split('-').map(Number);
  if (a1 !== a2) return `${d1} ${MESES_CORTOS[m1 - 1]} ${a1} – ${d2} ${MESES_CORTOS[m2 - 1]} ${a2}`;
  return `${d1} ${MESES_CORTOS[m1 - 1]} – ${d2} ${MESES_CORTOS[m2 - 1]}`;
}

/**
 * El día de corte que le toca a una entidad a partir de sus contratos activos: el que todos comparten.
 * Si no hay ninguno con corte, o los contratos tienen cortes distintos, no hay un ciclo único para la
 * entidad (null = mes calendario) y se avisa con `conflicto`.
 */
export function corteDeEntidad(cortesDeContratos: (number | null | undefined)[]): { dia: number | null; conflicto: boolean } {
  const distintos = [...new Set(cortesDeContratos.filter(corteValido).filter((d) => d !== 1))];
  if (distintos.length === 1) return { dia: distintos[0], conflicto: false };
  return { dia: null, conflicto: distintos.length > 1 };
}
