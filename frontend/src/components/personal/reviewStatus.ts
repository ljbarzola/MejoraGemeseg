// Paleta compartida de estados de revisión documental, para que todo el
// módulo Personal se lea igual.
export const REVIEW_COLORS: Record<string, { bg: string; fg: string }> = {
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
  PENDIENTE: { bg: '#fefcbf', fg: '#d69e2e' },
};

export const STALE_COLOR = { bg: '#fffbeb', fg: '#975a16' };
