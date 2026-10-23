// Etiquetas de las visitas de campo de Planificación y Campo: una sola lista para la pantalla de Visitas, la pestaña
// Resultados y el CSV (antes cada una escribía la suya y «Resultados» mostraba el código en inglés).
export const RESULTADO_VISITA_LABEL: Record<string, string> = {
  INTERESTED: 'Interesado',
  QUOTED: 'Cotizado',
  CLOSED_SALE: 'Venta cerrada',
  NOT_INTERESTED: 'No interesado',
  FOLLOW_UP: 'Requiere seguimiento',
};

export const ESTADO_VISITA_LABEL: Record<string, string> = {
  PLANNED: 'Agendada',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};
