// Las etapas de una oportunidad solo avanzan (2026-10-22). Una oportunidad abierta pasa a una etapa
// POSTERIOR (se pueden saltar etapas hacia adelante: cotizó en la primera llamada). Una cerrada
// (Aceptada o Perdida) solo puede REABRIRSE, y vuelve siempre a «En evaluación». Ir hacia atrás o de
// una cerrada a otra no se permite: evita errores y deja el historial entendible.
//
// Esta regla vive en el servidor para que ninguna pantalla ni el agente la salten; la lista
// desplegable del frontend solo la refleja (frontend/src/utils/etapasVentas.ts).

export interface EtapaOrden {
  key: string;
  label: string;
  order: number;
  isFinal: boolean;
}

// «En evaluación» (clave histórica LEIDO).
export const ETAPA_REAPERTURA = 'LEIDO';

// A dónde vuelve una oportunidad reabierta. Una empresa que borró o cambió esa etapa cae en la primera
// etapa abierta que no sea la inicial; si solo tiene una abierta, en esa.
export function etapaDeReapertura(etapas: EtapaOrden[]): EtapaOrden | null {
  const exacta = etapas.find((e) => e.key === ETAPA_REAPERTURA);
  if (exacta) return exacta;
  const abiertas = etapas.filter((e) => !e.isFinal).sort((a, b) => a.order - b.order);
  return abiertas[1] ?? abiertas[0] ?? null;
}

export type ResultadoCambio = { ok: true } | { ok: false; mensaje: string };

export function validarCambioDeEtapa(
  actual: EtapaOrden | null,
  cerrada: boolean,
  destino: EtapaOrden,
  etapas: EtapaOrden[],
): ResultadoCambio {
  // Sin etapa todavía (dato viejo): cualquiera sirve para empezar.
  if (!actual) return { ok: true };
  if (cerrada) {
    const reapertura = etapaDeReapertura(etapas);
    if (reapertura && destino.key === reapertura.key) return { ok: true };
    return {
      ok: false,
      mensaje: `Una oportunidad cerrada solo puede reabrirse: pásala a «${reapertura?.label ?? 'En evaluación'}».`,
    };
  }
  if (destino.order > actual.order) return { ok: true };
  return { ok: false, mensaje: 'Una oportunidad solo avanza: no se puede volver a una etapa anterior.' };
}
