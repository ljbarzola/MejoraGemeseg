// Etapas de fábrica de las OPORTUNIDADES (2026-10-08). Las claves no cambian
// (están en analítica, expediente, IA y modales); solo las etiquetas, y se suma
// NEGOCIACION. Quien llena el formulario y no contesta nunca pasa de «Nueva»;
// desde «En evaluación» (2026-10-27; antes «Cotizada») cuenta como lead cualificado y «Aceptada» como convertido
// (ver ventas-marketing.util.ts). Las empresas que ya tenían las etapas de
// fábrica sin tocar se actualizan solas al arrancar (VentasSchemaService).
export const DEFAULT_STAGES = [
  {
    key: 'RECIBIDO',
    label: 'Nueva',
    color: '#718096',
    order: 0,
    isInitial: true,
    isFinal: false,
  },
  {
    key: 'LEIDO',
    label: 'En evaluación',
    color: '#1d4ed8',
    order: 1,
    isInitial: false,
    isFinal: false,
  },
  {
    key: 'COTIZADO',
    label: 'Cotizada',
    color: '#6b46c1',
    order: 2,
    isInitial: false,
    isFinal: false,
  },
  {
    key: 'NEGOCIACION',
    label: 'En negociación',
    color: '#b7791f',
    order: 3,
    isInitial: false,
    isFinal: false,
  },
  {
    key: 'ACEPTADO',
    label: 'Aceptada',
    color: '#276749',
    order: 4,
    isInitial: false,
    isFinal: true,
  },
  {
    key: 'RECHAZADO',
    label: 'Perdida',
    color: '#c53030',
    order: 5,
    isInitial: false,
    isFinal: true,
  },
] as const;

// Etiquetas de las etapas ANTES del 2026-10-08. Sirven para reconocer una
// empresa que nunca las tocó y actualizarla (ver actualizarEtapasDeFabrica).
export const ETAPAS_FABRICA_ANTERIORES: Record<string, string> = {
  RECIBIDO: 'Recibido',
  LEIDO: 'Leído',
  COTIZADO: 'Cotizado',
  ACEPTADO: 'Aceptado',
  RECHAZADO: 'Rechazado',
};
