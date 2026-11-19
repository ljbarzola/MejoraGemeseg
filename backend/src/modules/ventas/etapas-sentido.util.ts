// Las etapas de una oportunidad se pueden mover en cualquier sentido (2026-11-19): una abierta pasa a
// cualquier otra etapa (adelante o atrás), una cerrada se reabre a la etapa que se elija y Aceptada ⇄
// Perdida se corrige directo. Cada cambio queda en el historial con quién, cuándo y la nota opcional.
//
// Lo único que no cambia: la etapa debe existir en la empresa y no puede ser la misma que ya tiene
// (eso lo valida `cambiarEtapa`). Esta regla vive en el servidor para que ninguna pantalla ni el agente
// la salten; el frontend la refleja en frontend/src/utils/etapasVentas.ts.

export interface EtapaOrden {
  key: string;
  label: string;
  order: number;
  isFinal: boolean;
}

// «En evaluación» (clave histórica LEIDO): destino por defecto sugerido al reabrir.
export const ETAPA_REAPERTURA = 'LEIDO';

// Etapa que se sugiere al reabrir. Una empresa que borró o cambió esa etapa cae en la primera etapa
// abierta que no sea la inicial; si solo tiene una abierta, en esa.
export function etapaDeReapertura(etapas: EtapaOrden[]): EtapaOrden | null {
  const exacta = etapas.find((e) => e.key === ETAPA_REAPERTURA);
  if (exacta) return exacta;
  const abiertas = etapas.filter((e) => !e.isFinal).sort((a, b) => a.order - b.order);
  return abiertas[1] ?? abiertas[0] ?? null;
}

export type ResultadoCambio = { ok: true } | { ok: false; mensaje: string };

export type TipoDeCambio = 'AVANCE' | 'RETROCESO' | 'REAPERTURA' | 'CORRECCION';

// Clasifica el cambio (para mensajes y para que el historial se entienda). Cualquier cambio es válido.
export function tipoDeCambio(actual: EtapaOrden | null, cerrada: boolean, destino: EtapaOrden): TipoDeCambio {
  if (cerrada) return destino.isFinal ? 'CORRECCION' : 'REAPERTURA';
  if (actual && destino.order < actual.order) return 'RETROCESO';
  return 'AVANCE';
}

export function validarCambioDeEtapa(
  actual: EtapaOrden | null,
  cerrada: boolean,
  destino: EtapaOrden,
  etapas: EtapaOrden[],
): ResultadoCambio {
  if (!etapas.some((e) => e.key === destino.key)) {
    return { ok: false, mensaje: `La etapa «${destino.label}» no existe en esta empresa.` };
  }
  if (actual && actual.key === destino.key && !cerrada) {
    return { ok: false, mensaje: 'La oportunidad ya está en esa etapa.' };
  }
  return { ok: true };
}
