// Fases de marketing de un contacto, tal como las usa quien maneja Google Ads
// (panel «Embudo de conversión de clientes potenciales»):
//
//   Interacciones     entraron a la página (solo lo ve Google, no el CRM)
//   Sin procesar      llenaron el formulario; si nadie les contesta o no
//                     cotizan, no pasan a la siguiente fase
//   Cualificado       el equipo lo puso En evaluación (o más adelante)
//   Convertido        contrataron
//
// No se guardan: se calculan con la oportunidad, así nadie las marca a mano y
// siempre coinciden con las etapas. «Cualificado» (desde 2026-10-27, antes era
// «cotizó») incluye lo que sigue después de la evaluación (Cotizada, En
// negociación) y también una oportunidad que se perdió después de evaluarse.
export type FaseMarketing = 'SIN_PROCESAR' | 'CUALIFICADO' | 'CONVERTIDO';

export const ETIQUETA_FASE_MARKETING: Record<FaseMarketing, string> = {
  SIN_PROCESAR: 'Sin procesar',
  CUALIFICADO: 'Cualificado (en evaluación)',
  CONVERTIDO: 'Convertido (contrató)',
};

// Etapas de la oportunidad en las que ya hubo cotización.
export const ETAPAS_COTIZADAS = ['COTIZADO', 'NEGOCIACION'];

// Etapas de fábrica desde las que el contacto cuenta como cualificado: En evaluación y todo lo que sigue.
export const ETAPAS_CUALIFICADAS = ['LEIDO', ...ETAPAS_COTIZADAS];

// Claves que cuentan como cualificado en UNA empresa (2026-10-27). Las empresas crean etapas propias (la de
// Gemeseg tiene «PROPUESTA_ENVIADA») y una clave que el código no conoce no puede quedar fuera del embudo:
// toda etapa intermedia (ni la inicial ni una final) significa que alguien ya trabaja el contacto, y se suma
// a las de fábrica. Las finales no cuentan: Aceptada ya es «convertido» y Perdida no avisa nada por sí sola.
export function clavesCualificadas(
  etapas: { key: string; isInitial: boolean; isFinal: boolean }[],
): string[] {
  return [
    ...new Set([
      ...ETAPAS_CUALIFICADAS,
      ...etapas.filter((e) => !e.isInitial && !e.isFinal).map((e) => e.key),
    ]),
  ];
}

export interface OportunidadParaFase {
  outcome: string | null;
  status: string | null;
  quotedAt: Date | null;
  // Etapas por las que pasó (toStatus de sus cambios de etapa).
  etapasAlcanzadas?: string[];
}

export function faseMarketing(
  o: OportunidadParaFase,
  cualificadas: string[] = ETAPAS_CUALIFICADAS,
): FaseMarketing {
  if (o.outcome === 'GANADA') return 'CONVERTIDO';
  const cualifico =
    o.quotedAt !== null ||
    (o.status !== null && cualificadas.includes(o.status)) ||
    (o.etapasAlcanzadas ?? []).some((k) => cualificadas.includes(k));
  return cualifico ? 'CUALIFICADO' : 'SIN_PROCESAR';
}

const ORDEN: Record<FaseMarketing, number> = {
  SIN_PROCESAR: 0,
  CUALIFICADO: 1,
  CONVERTIDO: 2,
};

export interface LeadParaEmbudo {
  channel: string;
  campaign: string | null;
  landing: string | null;
  // Fase de la oportunidad a la que pasó, o null si no pasó a ninguna.
  fase: FaseMarketing | null;
}

export interface FilaEmbudoMarketing {
  clave: string;
  leads: number;
  cualificados: number;
  convertidos: number;
  // % sobre el paso anterior (null si el anterior es 0).
  pctCualificados: number | null;
  pctConvertidos: number | null;
}

const pct = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

const fila = (clave: string, leads: LeadParaEmbudo[]): FilaEmbudoMarketing => {
  const cualificados = leads.filter((l) => l.fase && ORDEN[l.fase] >= 1).length;
  const convertidos = leads.filter((l) => l.fase && ORDEN[l.fase] >= 2).length;
  return {
    clave,
    leads: leads.length,
    cualificados,
    convertidos,
    pctCualificados: pct(cualificados, leads.length),
    pctConvertidos: pct(convertidos, cualificados),
  };
};

// Embudo acumulado: todo convertido cuenta también como cualificado.
export function embudoMarketing(
  leads: LeadParaEmbudo[],
  agruparPor: 'channel' | 'campaign' | 'landing',
): { total: FilaEmbudoMarketing; filas: FilaEmbudoMarketing[] } {
  const grupos = new Map<string, LeadParaEmbudo[]>();
  for (const l of leads) {
    const clave = (l[agruparPor] ?? '').trim() || 'Sin dato';
    grupos.set(clave, [...(grupos.get(clave) ?? []), l]);
  }
  const filas = [...grupos.entries()]
    .map(([clave, ls]) => fila(clave, ls))
    .sort((a, b) => b.leads - a.leads || a.clave.localeCompare(b.clave, 'es'));
  return { total: fila('Total', leads), filas };
}

// ---------------------------------------------------------------------------
// Embudo de los clics de WhatsApp de las landings (2026-10-30)
// ---------------------------------------------------------------------------
// Clic → Conversación (alguien escribió y el operador anotó el código del mensaje al crear el posible
// cliente) → En evaluación o más → Contrataron. Un clic NO es un lead: por eso va aparte del embudo de arriba
// y nunca se suma a «Posibles clientes». Las dos últimas fases salen de la oportunidad del posible cliente.
// Etapas en las que ya hubo cotización (la guía de medición separa «calificado» de «cotización enviada»). Incluye
// «Propuesta enviada», la etapa propia que Gemeseg agregó entre En evaluación y En negociación.
export const ETAPAS_DE_COTIZACION = [...ETAPAS_COTIZADAS, 'PROPUESTA_ENVIADA'];

// ¿La oportunidad llegó a cotizarse? Tiene fecha de cotización, está o pasó por una etapa de cotización, o ya se
// aceptó (una venta siempre pasó por una cotización, aunque nadie llenara la fecha).
export function cotizoOportunidad(o: OportunidadParaFase): boolean {
  return (
    o.outcome === 'GANADA' ||
    o.quotedAt !== null ||
    (o.status !== null && ETAPAS_DE_COTIZACION.includes(o.status)) ||
    (o.etapasAlcanzadas ?? []).some((k) => ETAPAS_DE_COTIZACION.includes(k))
  );
}

export interface ClicParaEmbudo {
  source: string;
  campaign: string | null;
  landing: string | null;
  // Hubo conversación: el clic quedó enlazado a un posible cliente.
  conversacion: boolean;
  // Fase de la oportunidad a la que pasó ese posible cliente, o null si aún no pasó a ninguna.
  fase: FaseMarketing | null;
  // La oportunidad llegó a cotizarse (ver cotizoOportunidad).
  cotizo: boolean;
  // Monto cotizado de la oportunidad si se ganó; 0 en cualquier otro caso.
  vendido: number;
}

export interface FilaEmbudoWhatsapp {
  clave: string;
  clics: number;
  conversaciones: number;
  cualificados: number;
  cotizaciones: number;
  convertidos: number;
  // Suma del monto cotizado de las oportunidades ganadas (base del ROAS por campaña).
  vendido: number;
  // % sobre el paso anterior (null si el anterior es 0).
  pctConversaciones: number | null;
  pctCualificados: number | null;
  pctCotizaciones: number | null;
  pctConvertidos: number | null;
}

const filaWhatsapp = (clave: string, clics: ClicParaEmbudo[]): FilaEmbudoWhatsapp => {
  const conversaciones = clics.filter((c) => c.conversacion).length;
  const cualificados = clics.filter((c) => c.fase && ORDEN[c.fase] >= 1).length;
  const cotizaciones = clics.filter((c) => c.cotizo).length;
  const convertidos = clics.filter((c) => c.fase && ORDEN[c.fase] >= 2).length;
  return {
    clave,
    clics: clics.length,
    conversaciones,
    cualificados,
    cotizaciones,
    convertidos,
    vendido: Math.round(clics.reduce((suma, c) => suma + c.vendido, 0) * 100) / 100,
    pctConversaciones: pct(conversaciones, clics.length),
    pctCualificados: pct(cualificados, conversaciones),
    pctCotizaciones: pct(cotizaciones, cualificados),
    pctConvertidos: pct(convertidos, cotizaciones),
  };
};

// Sin UTM el script guarda direct / none / none: se muestran como «Directo» y «Sin dato».
const claveDeClic = (c: ClicParaEmbudo, por: 'channel' | 'campaign' | 'landing'): string => {
  if (por === 'channel') {
    const s = (c.source ?? '').trim().toLowerCase();
    return !s || s === 'direct' ? 'Directo' : s;
  }
  const v = ((por === 'campaign' ? c.campaign : c.landing) ?? '').trim();
  return !v || v.toLowerCase() === 'none' ? 'Sin dato' : v;
};

export function embudoWhatsapp(
  clics: ClicParaEmbudo[],
  agruparPor: 'channel' | 'campaign' | 'landing',
): { total: FilaEmbudoWhatsapp; filas: FilaEmbudoWhatsapp[] } {
  const grupos = new Map<string, ClicParaEmbudo[]>();
  for (const c of clics) {
    const clave = claveDeClic(c, agruparPor);
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  const filas = [...grupos.entries()]
    .map(([clave, cs]) => filaWhatsapp(clave, cs))
    .sort((a, b) => b.clics - a.clics || a.clave.localeCompare(b.clave, 'es'));
  return { total: filaWhatsapp('Total', clics), filas };
}
