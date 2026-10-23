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

// Las etapas solo avanzan: una abierta pasa a una posterior; una cerrada solo se reabre. El servidor lo exige
// igual; aquí la lista desplegable deja sin elegir lo que no se puede.
export function etapaPermitida<T extends EtapaOrden>(
  opp: { status?: string | null; abierta: boolean },
  destino: T,
  etapas: T[],
): boolean {
  const actual = etapas.find((e) => e.key === opp.status);
  if (!actual || destino.key === opp.status) return true;
  if (!opp.abierta) return destino.key === etapaDeReapertura(etapas)?.key;
  return destino.order > actual.order;
}

export const SIGNIFICADO_ETAPA: Record<string, string> = {
  RECIBIDO: 'Acaba de entrar y nadie la ha atendido todavía.',
  LEIDO: 'Ya la atiende un vendedor y está entendiendo qué necesita el cliente.',
  COTIZADO: 'Ya se le envió el precio. Aquí se registra el monto cotizado y la fecha.',
  NEGOCIACION: 'El cliente respondió y se ajustan precio o condiciones.',
  ACEPTADO: 'El cliente aceptó. Se registra el contrato y pasa a ser cliente.',
  RECHAZADO: 'No se concretó. Se guarda el motivo para entender por qué.',
};
