// Motivos de rechazo frecuentes al revisar un documento. Los usan RRHH
// (DocumentReviewModal) y Contratación Pública (RevisionPanel): un clic llena el
// cuadro del motivo y la persona lo puede editar.
export const MOTIVOS_RECHAZO_RAPIDOS = [
  'Documento ilegible',
  'Documento caducado',
  'No corresponde al tipo solicitado',
  'Falta firma o sello',
];

/** Largo mínimo del motivo de un rechazo. */
export const MIN_MOTIVO_RECHAZO = 5;
