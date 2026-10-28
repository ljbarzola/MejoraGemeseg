// Hechos de conversión que se le avisan a Google Ads (2026-10-15). Funciones
// puras: deciden QUÉ hechos produce un cambio de etapa y si el clic todavía
// sirve. Son las mismas fases del embudo de marketing (ventas-marketing.util.ts)
// para que las cifras del CRM cuadren con el panel de Google.

import { ETAPAS_CUALIFICADAS } from './ventas-marketing.util';

// VALIDO (2026-10-18) es el paso INTERMEDIO entre llenar el formulario y cotizar: una persona del
// equipo revisó el posible cliente y confirmó que es un contacto real de servicio (no empleo,
// proveedor ni spam). Sirve para que Google aprenda qué anuncios traen contactos reales y no solo
// formularios. Es opcional: solo se registra y se envía si la empresa guardó el ID de esa conversión.
export type TipoConversion = 'VALIDO' | 'CUALIFICADO' | 'CONVERTIDO';

export const ETIQUETA_CONVERSION: Record<TipoConversion, string> = {
  VALIDO: 'Lead válido (contacto real de servicio)',
  CUALIFICADO: 'Lead cualificado (en evaluación)',
  CONVERTIDO: 'Lead convertido (contrató)',
};

// Google guarda el gclid 90 días: pasado ese plazo ya no puede asociar la
// conversión al anuncio y rechazaría el envío.
export const VIGENCIA_GCLID_DIAS = 90;

// Qué hechos produce la oportunidad al entrar a una etapa. Desde 2026-10-27
// «cualificado» es En evaluación o más adelante (antes era Cotizada). Aceptar
// sin haber pasado por evaluación también cuenta como cualificado (el embudo es
// acumulado: todo convertido fue antes cualificado).
// `cualificadas` son las claves de la empresa (ver clavesCualificadas): incluye sus etapas propias.
export function hechosDeEtapa(
  destinoKey: string,
  outcome: 'GANADA' | 'PERDIDA' | null,
  cualificadas: string[] = ETAPAS_CUALIFICADAS,
): TipoConversion[] {
  if (outcome === 'GANADA') return ['CUALIFICADO', 'CONVERTIDO'];
  if (cualificadas.includes(destinoKey)) return ['CUALIFICADO'];
  return [];
}

// Lo mismo, pero mirando todo el camino de una oportunidad (etapas por las que
// pasó + resultado actual). Sirve para rellenar lo que faltó registrar, p. ej.
// las oportunidades que ya estaban En evaluación cuando cambió la regla.
export function hechosAcumulados(
  etapas: string[],
  outcome: 'GANADA' | 'PERDIDA' | null,
  cualificadas: string[] = ETAPAS_CUALIFICADAS,
): TipoConversion[] {
  if (outcome === 'GANADA') return ['CUALIFICADO', 'CONVERTIDO'];
  return etapas.some((k) => cualificadas.includes(k)) ? ['CUALIFICADO'] : [];
}

export const diasEntre = (desde: Date, hasta: Date) =>
  Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);

// El clic se aproxima por la llegada del lead (el formulario se llena en la
// misma visita). `true` si todavía se puede avisar a Google.
export function gclidVigente(llegadaDelLead: Date, ahora: Date = new Date()): boolean {
  return diasEntre(llegadaDelLead, ahora) <= VIGENCIA_GCLID_DIAS;
}

// Deja el gclid como Google lo espera (2026-10-28): sin espacios, sin codificación de URL y sin el prefijo
// que ponen las cookies de Google (`_gcl_aw` = «GCL.<fecha>.<gclid>», `_gac_*` = «1.<fecha>.<gclid>»).
export function limpiarGclid(raw: string): string {
  let t = (raw ?? '').trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // no venía codificado: se deja tal cual
  }
  return t.replace(/^(?:GCL|1)\.\d{9,11}\./i, '').trim();
}

// ¿Tiene pinta de gclid de verdad? Google responde INVALID_GCLID («el identificador de clic no se pudo
// decodificar») cuando no: un gclid real es texto largo de letras, números, «-» y «_». Los de ejemplo
// («EJEMPLO_GCLID_001»), los de la prueba de Google («TeSter-…») o los que llegan recortados no pasan.
export function gclidConFormato(gclid: string): boolean {
  return /^[A-Za-z0-9_-]{20,255}$/.test(gclid) && !/^(tester|ejemplo|example|test[-_])/i.test(gclid);
}

export const MOTIVO_GCLID_INVALIDO =
  'El identificador de clic no es válido (parece de prueba o llegó incompleto): Google no puede reconocerlo.';

// El gclid de un lead (viene de la landing o de Google Ads), o null.
export function gclidDeLead(extra: unknown): string | null {
  const v = (extra as Record<string, unknown> | null | undefined)?.['gclid'];
  const t = typeof v === 'string' ? limpiarGclid(v) : '';
  return t ? t.slice(0, 300) : null;
}
