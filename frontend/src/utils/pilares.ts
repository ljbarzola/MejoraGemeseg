// «Pilares de servicio» del catálogo (2026-11-13). Cada clave guarda la categoría real del pilar
// (Seguridad Física / Monitoreo / Soluciones Tecnológicas) y el nombre de empresa con el que se
// identifica en Configuración → Servicios. En el resto de módulos se muestra SOLO el nombre del pilar.
// Espejo de backend/src/modules/ventas/ventas-pilares.const.ts.
export const PILARES = [
  { key: 'GEMESEG', nombre: 'Gemeseg', categoria: 'Seguridad Física', color: '#2b6cb0' },
  { key: 'MEGAMONT', nombre: 'Megamont', categoria: 'Monitoreo', color: '#2f855a' },
  { key: 'ADASMEG', nombre: 'Adasmeg', categoria: 'Soluciones Tecnológicas', color: '#b7791f' },
] as const;

export const SIN_PILAR = 'Sin pilar';
export const SIN_PILAR_SERVICIO = 'Sin pilar de servicio';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** El pilar de una categoría («Seguridad Física» → GEMESEG), o '' si no es una de las tres. */
export const pilarDeCategoria = (categoria?: string | null): string =>
  PILARES.find((p) => sinTildes(p.categoria) === sinTildes(categoria ?? ''))?.key ?? '';

/** Nombre de empresa (solo se usa en Configuración → Servicios). */
export const nombreDePilar = (clave?: string | null): string =>
  PILARES.find((p) => p.key === clave)?.nombre ?? SIN_PILAR;

/** Nombre del pilar de servicio: el que se muestra en el Cotizador y en el resto de módulos. */
export const nombrePilarServicio = (clave?: string | null): string =>
  PILARES.find((p) => p.key === clave)?.categoria ?? SIN_PILAR_SERVICIO;

export const colorDePilar = (clave?: string | null): string =>
  PILARES.find((p) => p.key === clave)?.color ?? '#a0aec0';
