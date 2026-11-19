// Qué significa cada etapa de fábrica de una oportunidad (2026-10-22). Se muestra al pasar el mouse sobre
// la etapa y en el ícono «?» del encabezado «Etapa». Las claves no cambian aunque la empresa renombre las
// etiquetas; una etapa propia de la empresa (sin clave conocida) simplemente no tiene explicación.
interface EtapaOrden { key: string; order: number; isFinal: boolean }

// A dónde vuelve una oportunidad reabierta: «En evaluación» (clave LEIDO); si la empresa la quitó, la primera etapa
// abierta después de la inicial. Espejo de backend/src/modules/ventas/etapas-sentido.util.ts.
export function etapaDeReapertura<T extends EtapaOrden>(etapas: T[]): T | null {
  const exacta = etapas.find((e) => e.key === 'LEIDO');
  if (exacta) return exacta;
  const abiertas = etapas.filter((e) => !e.isFinal).sort((a, b) => a.order - b.order);
  return abiertas[1] ?? abiertas[0] ?? null;
}

// Las etapas se mueven en cualquier sentido (abierta adelante o atrás, cerrada a la etapa que se elija y
// Aceptada ⇄ Perdida). Cualquier etapa de la empresa es un destino válido; lo único que no se permite es
// quedarse en la misma. El servidor aplica la misma regla.
export function etapaPermitida<T extends EtapaOrden>(
  _opp: { status?: string | null; abierta: boolean },
  _destino: T,
  _etapas: T[],
): boolean {
  return true;
}

export type TipoCambioEtapa = 'AVANCE' | 'RETROCESO' | 'REAPERTURA' | 'CORRECCION';

// Qué clase de cambio es, para que el cuadro de confirmación lo explique y pida la nota.
export function tipoCambioEtapa<T extends EtapaOrden>(
  opp: { status?: string | null; abierta: boolean },
  destino: T,
  etapas: T[],
): TipoCambioEtapa {
  if (!opp.abierta) return destino.isFinal ? 'CORRECCION' : 'REAPERTURA';
  const actual = etapas.find((e) => e.key === opp.status);
  return actual && destino.order < actual.order ? 'RETROCESO' : 'AVANCE';
}

export const SIGNIFICADO_ETAPA: Record<string, string> = {
  RECIBIDO: 'Acaba de entrar y nadie la ha atendido todavía.',
  LEIDO: 'Ya la atiende un vendedor y está entendiendo qué necesita el cliente.',
  COTIZADO: 'Ya se le envió el precio. Aquí se registra el monto cotizado y la fecha.',
  NEGOCIACION: 'El cliente respondió y se ajustan precio o condiciones.',
  ACEPTADO: 'El cliente aceptó. Se registra el contrato y pasa a ser cliente.',
  RECHAZADO: 'No se concretó. Se guarda el motivo para entender por qué.',
};
