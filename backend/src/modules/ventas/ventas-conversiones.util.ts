// Hechos de conversión que se le avisan a Google Ads (2026-10-15). Funciones
// puras: deciden QUÉ hechos produce un cambio de etapa y si el clic todavía
// sirve. Son las mismas fases del embudo de marketing (ventas-marketing.util.ts)
// para que las cifras del CRM cuadren con el panel de Google.

import { ETAPAS_COTIZADAS } from './ventas-marketing.util';

// VALIDO (2026-10-18) es el paso INTERMEDIO entre llenar el formulario y cotizar: una persona del
// equipo revisó el posible cliente y confirmó que es un contacto real de servicio (no empleo,
// proveedor ni spam). Sirve para que Google aprenda qué anuncios traen contactos reales y no solo
// formularios. Es opcional: solo se registra y se envía si la empresa guardó el ID de esa conversión.
export type TipoConversion = 'VALIDO' | 'CUALIFICADO' | 'CONVERTIDO';

export const ETIQUETA_CONVERSION: Record<TipoConversion, string> = {
  VALIDO: 'Lead válido (contacto real de servicio)',
  CUALIFICADO: 'Lead cualificado (cotizó)',
  CONVERTIDO: 'Lead convertido (contrató)',
};

// Google guarda el gclid 90 días: pasado ese plazo ya no puede asociar la
// conversión al anuncio y rechazaría el envío.
export const VIGENCIA_GCLID_DIAS = 90;

// Qué hechos produce la oportunidad al entrar a una etapa. Aceptar sin haber
// cotizado también cuenta como cualificado (el embudo es acumulado: todo
// convertido fue antes cualificado).
export function hechosDeEtapa(
  destinoKey: string,
  outcome: 'GANADA' | 'PERDIDA' | null,
): TipoConversion[] {
  if (outcome === 'GANADA') return ['CUALIFICADO', 'CONVERTIDO'];
  if (ETAPAS_COTIZADAS.includes(destinoKey)) return ['CUALIFICADO'];
  return [];
}

export const diasEntre = (desde: Date, hasta: Date) =>
  Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);

// El clic se aproxima por la llegada del lead (el formulario se llena en la
// misma visita). `true` si todavía se puede avisar a Google.
export function gclidVigente(llegadaDelLead: Date, ahora: Date = new Date()): boolean {
  return diasEntre(llegadaDelLead, ahora) <= VIGENCIA_GCLID_DIAS;
}

// El gclid de un lead (viene de la landing o de Google Ads), o null.
export function gclidDeLead(extra: unknown): string | null {
  const v = (extra as Record<string, unknown> | null | undefined)?.['gclid'];
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t.slice(0, 300) : null;
}
