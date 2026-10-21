// Tipos de documento de Documentación (2026-10-18). Misma lista que
// backend/src/modules/ventas/ventas-documento-tipos.const.ts: las claves no se renombran.
export const TIPOS_DOCUMENTO = [
  { key: 'CONTRATO', label: 'Contrato' },
  { key: 'ADENDA', label: 'Adenda o anexo' },
  { key: 'GARANTIA', label: 'Garantía' },
  { key: 'ACTA_ENTREGA', label: 'Acta de entrega' },
  { key: 'ORDEN_COMPRA', label: 'Orden de compra' },
  { key: 'OTRO', label: 'Otro' },
] as const;

export const TIPO_OTRO_MAX = 60;

// «Otro» muestra el nombre que escribió la persona; un documento sin tipo (anterior a esta
// función o generado desde una plantilla) devuelve null.
export function etiquetaTipoDocumento(tipo?: string | null, otro?: string | null): string | null {
  if (!tipo) return null;
  if (tipo === 'OTRO') return otro?.trim() || 'Otro';
  return TIPOS_DOCUMENTO.find((t) => t.key === tipo)?.label ?? null;
}
