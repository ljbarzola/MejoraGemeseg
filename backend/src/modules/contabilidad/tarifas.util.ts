// Reglas puras de las tarifas de custodia (2026-11-16). Sin base de datos, para poder probarlas.

export const TIPOS_CUSTODIA = ['HACIENDA', 'PUERTO', 'VIP'] as const;
export type TipoCustodiaContab = (typeof TIPOS_CUSTODIA)[number];

/** Personas que cobran en un viaje: el chofer y dos custodios. */
export const PERSONAS_POR_VIAJE = 3;

export interface TarifaFila {
  tipo: string;
  valorPorPersona: number;
  /** Día (YYYY-MM-DD) desde el que rige. */
  vigenteDesde: string;
}

// El día de Ecuador y las fechas de un viaje se calculan igual en Custodias y Contabilidad.
export { diaEcuador } from '../../common/utils/viaje-fechas.util';

/**
 * La tarifa por persona que rige un día para un tipo: la fila más reciente cuya vigencia ya empezó.
 * Si todavía no hay ninguna que cubra esa fecha devuelve null (el viaje queda «sin tarifa», no en $0
 * silencioso).
 */
export function tarifaVigente(
  tarifas: TarifaFila[],
  tipo: string,
  dia: string,
): number | null {
  let elegida: TarifaFila | null = null;
  for (const t of tarifas) {
    if (t.tipo !== tipo || t.vigenteDesde > dia) continue;
    if (!elegida || t.vigenteDesde > elegida.vigenteDesde) elegida = t;
  }
  return elegida ? elegida.valorPorPersona : null;
}

/** Tarifa vigente HOY de cada tipo (null = sin definir), para la pantalla de tarifas. */
export function tarifasDeHoy(
  tarifas: TarifaFila[],
  hoy: string,
): Record<string, number | null> {
  const r: Record<string, number | null> = {};
  for (const tipo of TIPOS_CUSTODIA) r[tipo] = tarifaVigente(tarifas, tipo, hoy);
  return r;
}

export const esDiaValido = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));

export const esTipoValido = (s: unknown): s is TipoCustodiaContab =>
  typeof s === 'string' && (TIPOS_CUSTODIA as readonly string[]).includes(s);
