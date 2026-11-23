// «Pilares» del catálogo de servicios (2026-11-13): las tres categorías de siempre con el nombre de la empresa a la
// que corresponde. No son empresas nuevas. Espejo de backend/src/modules/ventas/ventas-pilares.const.ts.
export const PILARES = [
  { key: 'GEMESEG', nombre: 'Gemeseg', categoria: 'Seguridad Física', color: '#2b6cb0' },
  { key: 'MEGAMONT', nombre: 'Megamont', categoria: 'Monitoreo', color: '#2f855a' },
  { key: 'ADASMEG', nombre: 'Adasmeg', categoria: 'Soluciones Tecnológicas', color: '#b7791f' },
] as const;

export const SIN_PILAR = 'Sin pilar';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** El pilar de una categoría («Seguridad Física» → GEMESEG), o '' si no es una de las tres. */
export const pilarDeCategoria = (categoria?: string | null): string =>
  PILARES.find((p) => sinTildes(p.categoria) === sinTildes(categoria ?? ''))?.key ?? '';

export const nombreDePilar = (clave?: string | null): string =>
  PILARES.find((p) => p.key === clave)?.nombre ?? SIN_PILAR;

export const colorDePilar = (clave?: string | null): string =>
  PILARES.find((p) => p.key === clave)?.color ?? '#a0aec0';
