/**
 * «Pilares» del catálogo de servicios (2026-11-13). Son las tres categorías de siempre con el nombre de la
 * empresa a la que corresponde: NO son empresas nuevas ni registros `Company`. Cada servicio guarda su
 * pilar en `SalesService.pilar` (clave en mayúsculas) y se cambia en Configuración → Servicios.
 *
 *  · null  = todavía sin asignar (el arranque lo rellena según la categoría, ver sales-service-pilar.schema.ts).
 *  · ''    = «Sin pilar» elegido a propósito (un servicio que no es de ninguno): no se vuelve a rellenar.
 */
export const PILARES = [
  { key: 'GEMESEG', nombre: 'Gemeseg', categoria: 'Seguridad Física' },
  { key: 'MEGAMONT', nombre: 'Megamont', categoria: 'Monitoreo' },
  { key: 'ADASMEG', nombre: 'Adasmeg', categoria: 'Soluciones Tecnológicas' },
] as const;

export type ClavePilar = (typeof PILARES)[number]['key'];

export const CLAVES_PILAR: string[] = PILARES.map((p) => p.key);

export const SIN_PILAR = 'Sin pilar';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** El pilar que le toca a una categoría («Seguridad Física» → GEMESEG), o null si no es una de las tres. */
export function pilarDeCategoria(categoria: string | null | undefined): ClavePilar | null {
  if (!categoria) return null;
  const buscada = sinTildes(categoria);
  return PILARES.find((p) => sinTildes(p.categoria) === buscada)?.key ?? null;
}

/** Nombre para mostrar. Un servicio sin pilar (null o '') sale como «Sin pilar». */
export function nombreDePilar(clave: string | null | undefined): string {
  return PILARES.find((p) => p.key === clave)?.nombre ?? SIN_PILAR;
}
