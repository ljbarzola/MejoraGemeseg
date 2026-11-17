// Etiquetas de las visitas de campo de Planificación y Campo: una sola lista para la pantalla de Visitas, la pestaña
// Resultados y el CSV (antes cada una escribía la suya y «Resultados» mostraba el código en inglés).
export const RESULTADO_VISITA_LABEL: Record<string, string> = {
  INTERESTED: 'Interesado',
  QUOTED: 'Cotizado',
  CLOSED_SALE: 'Venta cerrada',
  NOT_INTERESTED: 'No interesado',
  FOLLOW_UP: 'Requiere seguimiento',
};

// Por qué no se cumplió una visita planificada (pedido del asesor comercial, 2026-11-17). Lista fija, sin
// configuración; «Otro» deja escribir. Se guarda el texto tal cual (ClientVisit.cancelMotivo).
export const MOTIVOS_VISITA_NO_CUMPLIDA = [
  'El cliente canceló',
  'El cliente no estaba o no atendió',
  'Se reprogramó para otra fecha',
  'No alcanzó el tiempo',
  'Problema de transporte o de la vía',
  'Otra prioridad de trabajo',
];

export const ESTADO_VISITA_LABEL: Record<string, string> = {
  PLANNED: 'Agendada',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};
