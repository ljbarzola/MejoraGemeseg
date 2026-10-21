/**
 * Tipos de documento de Documentación (2026-10-18). Un contrato puede tener varios documentos
 * de distintos tipos; «Otro» pide un nombre propio. Las claves se guardan en
 * "SalesContract"."documentType" y NO se renombran (solo cambian las etiquetas); la misma lista
 * está en frontend/src/utils/documentoTipos.ts.
 */
export const TIPOS_DOCUMENTO = [
  { key: 'CONTRATO', label: 'Contrato' },
  { key: 'ADENDA', label: 'Adenda o anexo' },
  { key: 'GARANTIA', label: 'Garantía' },
  { key: 'ACTA_ENTREGA', label: 'Acta de entrega' },
  { key: 'ORDEN_COMPRA', label: 'Orden de compra' },
  { key: 'OTRO', label: 'Otro' },
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['key'];

export const TIPO_OTRO_MAX = 60;

/** Etiqueta legible de un tipo («Otro» usa el nombre escrito por la persona). */
export function etiquetaTipoDocumento(
  tipo?: string | null,
  otro?: string | null,
): string | null {
  if (!tipo) return null;
  if (tipo === 'OTRO') return otro?.trim() || 'Otro';
  return TIPOS_DOCUMENTO.find((t) => t.key === tipo)?.label ?? null;
}

/**
 * Valida el tipo recibido. Devuelve null si es válido o el mensaje (en español) si no.
 * `requerido` = false deja pasar «sin tipo».
 */
export function normalizarTipoDocumento(
  tipo: unknown,
  otro: unknown,
  requerido: boolean,
):
  | { ok: true; tipo: TipoDocumento | null; otro: string | null }
  | { ok: false; mensaje: string } {
  const t = typeof tipo === 'string' ? tipo.trim() : '';
  if (!t) {
    return requerido
      ? { ok: false, mensaje: 'Elige el tipo de documento (Contrato, Garantía, etc.).' }
      : { ok: true, tipo: null, otro: null };
  }
  if (!TIPOS_DOCUMENTO.some((x) => x.key === t)) {
    return { ok: false, mensaje: 'El tipo de documento no es válido.' };
  }
  if (t !== 'OTRO') return { ok: true, tipo: t as TipoDocumento, otro: null };
  const texto = typeof otro === 'string' ? otro.trim() : '';
  if (!texto) {
    return { ok: false, mensaje: 'Escribe cómo se llama el tipo de documento «Otro».' };
  }
  if (texto.length > TIPO_OTRO_MAX) {
    return { ok: false, mensaje: `El nombre del tipo no puede pasar de ${TIPO_OTRO_MAX} letras.` };
  }
  return { ok: true, tipo: 'OTRO', otro: texto };
}
