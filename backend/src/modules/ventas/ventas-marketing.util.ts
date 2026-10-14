// Fases de marketing de un contacto, tal como las usa quien maneja Google Ads
// (panel «Embudo de conversión de clientes potenciales»):
//
//   Interacciones     entraron a la página (solo lo ve Google, no el CRM)
//   Sin procesar      llenaron el formulario; si nadie les contesta o no
//                     cotizan, no pasan a la siguiente fase
//   Cualificado       cotizaron
//   Convertido        contrataron
//
// No se guardan: se calculan con la oportunidad, así nadie las marca a mano y
// siempre coinciden con las etapas. «Cualificado» incluye lo que sigue después
// de cotizar (En negociación) y también una oportunidad que se perdió después
// de cotizar: cotizó, aunque no haya contratado.
export type FaseMarketing = 'SIN_PROCESAR' | 'CUALIFICADO' | 'CONVERTIDO';

export const ETIQUETA_FASE_MARKETING: Record<FaseMarketing, string> = {
  SIN_PROCESAR: 'Sin procesar',
  CUALIFICADO: 'Cualificado (cotizó)',
  CONVERTIDO: 'Convertido (contrató)',
};

// Etapas de la oportunidad en las que ya hubo cotización.
export const ETAPAS_COTIZADAS = ['COTIZADO', 'NEGOCIACION'];

export interface OportunidadParaFase {
  outcome: string | null;
  status: string | null;
  quotedAt: Date | null;
  // Etapas por las que pasó (toStatus de sus cambios de etapa).
  etapasAlcanzadas?: string[];
}

export function faseMarketing(o: OportunidadParaFase): FaseMarketing {
  if (o.outcome === 'GANADA') return 'CONVERTIDO';
  const cotizo =
    o.quotedAt !== null ||
    (o.status !== null && ETAPAS_COTIZADAS.includes(o.status)) ||
    (o.etapasAlcanzadas ?? []).some((k) => ETAPAS_COTIZADAS.includes(k));
  return cotizo ? 'CUALIFICADO' : 'SIN_PROCESAR';
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
