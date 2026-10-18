import type { MotivoKind } from '../services/ventas.service';

// Los motivos de cierre se dividen en TRES niveles del embudo, cada uno con su
// lugar y su lista de motivos (decisión de Ventas, 2026-10-18). Los nombres están
// pensados para gente de ventas: nada de «LEAD_DESCARTE» ni «kinds» en pantalla.
export type GrupoMotivoClave = 'POSIBLE_CLIENTE' | 'OPORTUNIDAD' | 'CONTRATO';

export interface GrupoMotivos {
  clave: GrupoMotivoClave;
  titulo: string;
  // Dónde se pide este motivo.
  donde: string;
  // Para qué sirve analizarlo.
  ejemplos: string;
  kinds: MotivoKind[];
}

export const GRUPOS_MOTIVOS: GrupoMotivos[] = [
  {
    clave: 'POSIBLE_CLIENTE',
    titulo: 'Por qué descartamos un posible cliente',
    donde: 'Se pide en Posibles clientes, al descartar uno.',
    ejemplos: 'Sirve para saber cuánta gente que llega no era para nosotros: spam, busca empleo, era un proveedor, no contestó…',
    kinds: ['LEAD_DESCARTE'],
  },
  {
    clave: 'OPORTUNIDAD',
    titulo: 'Por qué se perdió una oportunidad',
    donde: 'Se pide en Oportunidades, al marcar una como perdida.',
    ejemplos: 'Ya se habló del servicio y se cotizó, pero no se dio: muy caro, eligió a la competencia, no respondió…',
    kinds: ['OPP_PERDIDA'],
  },
  {
    clave: 'CONTRATO',
    titulo: 'Por qué terminó un contrato',
    donde: 'Se pide en Contratos: al cancelar uno, al registrar por qué venció sin renovarse y al renovar con menos.',
    ejemplos: 'Sirve para ver por qué se van los clientes, por ejemplo uno que contrató en enero y un mes después ya no siguió. Aplica sobre todo a servicios: una venta de producto es única y casi no tiene motivo de no renovación.',
    kinds: ['CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO', 'CONTRATO_REDUCCION'],
  },
];

// Cuándo se usa cada motivo, dicho como pasa en la vida real.
export const ETIQUETA_CIERRE: Record<MotivoKind, string> = {
  LEAD_DESCARTE: 'Se descarta un posible cliente',
  OPP_PERDIDA: 'Se pierde una oportunidad',
  CONTRATO_CANCELADO: 'Se cancela un contrato antes de terminar',
  CONTRATO_NO_RENOVADO: 'Un contrato vence y no se renueva',
  CONTRATO_REDUCCION: 'Un contrato se renueva con menos servicios o menor valor',
};

// Versión corta, para las etiquetas dentro de un grupo.
export const ETIQUETA_CIERRE_CORTA: Record<MotivoKind, string> = {
  LEAD_DESCARTE: 'Descarte',
  OPP_PERDIDA: 'Pérdida',
  CONTRATO_CANCELADO: 'Contrato cancelado',
  CONTRATO_NO_RENOVADO: 'Venció sin renovar',
  CONTRATO_REDUCCION: 'Renovó con menos',
};

// La pregunta que ve quien está cerrando algo, encima de la lista de motivos.
export const PREGUNTA_MOTIVO: Record<MotivoKind, string> = {
  LEAD_DESCARTE: '¿Por qué se descarta este posible cliente?',
  OPP_PERDIDA: '¿Por qué se perdió la oportunidad?',
  CONTRATO_CANCELADO: '¿Por qué se canceló el contrato?',
  CONTRATO_NO_RENOVADO: '¿Por qué no se renovó el contrato?',
  CONTRATO_REDUCCION: '¿Por qué baja el contrato?',
};

export const grupoDeKind = (kind: MotivoKind): GrupoMotivos =>
  GRUPOS_MOTIVOS.find((g) => g.kinds.includes(kind)) ?? GRUPOS_MOTIVOS[0];
