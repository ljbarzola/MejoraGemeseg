// Etiquetas en lenguaje de persona para los valores internos de Marketing: la pantalla nunca debe
// mostrar «APROBADO», «imagen» o «general» tal como vienen de la base.

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  BORRADOR: { texto: 'En borrador', clase: 'borrador' },
  APROBADA: { texto: 'Aprobada', clase: 'aprobada' },
  APROBADO: { texto: 'Aprobada', clase: 'aprobada' },
  DESCARTADO: { texto: 'Descartada', clase: 'descartada' },
  LISTO: { texto: 'Lista para publicar', clase: 'aprobada' },
  PENDIENTE: { texto: 'Pendiente', clase: 'pendiente' },
  OMITIDO: { texto: 'Omitido', clase: 'descartada' },
  PROGRAMADO: { texto: 'Programada', clase: 'pendiente' },
  PUBLICADO: { texto: 'Publicada', clase: 'aprobada' },
  EN_PAUSA: { texto: 'Creada en pausa', clase: 'pendiente' },
};

export function estadoMarketing(estado: string | null | undefined): { texto: string; clase: string } {
  const clave = (estado || '').toUpperCase();
  return ESTADOS[clave] ?? { texto: capitalizar(estado || 'Sin estado'), clase: 'borrador' };
}

const TIPOS: Record<string, string> = {
  texto: 'Texto',
  imagen: 'Imagen',
  video: 'Video',
};

export function etiquetaTipo(tipo: string | null | undefined): string {
  const clave = (tipo || '').toLowerCase();
  return TIPOS[clave] ?? capitalizar(tipo || 'Pieza');
}

/** `null` o «general» se muestran como «General»; el resto, con la primera letra en mayúscula. */
const ORIGENES: Record<string, string> = {
  DATO_INTERNO: 'Dato interno',
  INFERENCIA: 'Inferencia',
  FUENTE_EXTERNA: 'Fuente externa',
};

/** De dónde sale lo que dice una pieza: dato de la empresa, suposición del agente o fuente citada. */
export function etiquetaOrigen(origen: string | null | undefined): string {
  return ORIGENES[(origen || '').toUpperCase()] ?? 'Inferencia';
}

export function etiquetaCanal(canal: string | null | undefined): string {
  const valor = (canal || '').trim();
  if (!valor || valor.toLowerCase() === 'general') return 'General';
  return capitalizar(valor);
}

export function capitalizar(texto: string): string {
  const t = texto.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Fecha y hora en horario de Ecuador, sin segundos. */
export function fechaMarketing(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });
}
