/**
 * Enlace entre el inventario y los puestos de servicio (2026-11-23).
 *
 * La carga desde el Excel de Operaciones guarda el puesto de cada arma y de cada chaleco con su NOMBRE.
 * Cuando ese puesto existe en la aplicación se enlaza por nombre; si no existe todavía, queda solo el
 * nombre y el contrato lo encuentra igual al comparar nombres. Solo se enlaza por nombre cuando es
 * inequívoco: si dos puestos de la empresa se llaman igual (en contratos distintos), no se adivina.
 */

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Nombre de puesto comparable: sin tildes, en mayúsculas, y sin guiones, puntos ni otra puntuación (2026-11-24):
 * «CNEL COLONCHE» y «CNEL - COLONCHE» son el mismo puesto. Los números sí cuentan: «DISTRITO CAÑAR (2)» no es
 * «DISTRITO CAÑAR».
 */
export function normalizarPuesto(nombre: string | null | undefined): string {
  return quitarTildes(nombre ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => !CONECTORES.has(t))
    .map((t) => ABREVIATURAS[t] ?? t)
    .join(' ');
}

/** Palabras de enlace que no distinguen un puesto de otro: «MINISTERIO DE GOBIERNO» = «MINISTERIO GOBIERNO». */
const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL']);

/**
 * Abreviaturas que Operaciones usa en lugar de la palabra completa (2026-11-24, pedido de Leidy: «MIN» y
 * «MINISTERIO» son lo mismo y deben quedar bajo un solo nombre). Se compara palabra por palabra, así que
 * «MIN GOBIERNO ORION 1» y «MINISTERIO GOBIERNO ORION 1» coinciden. Agregar aquí solo abreviaturas inequívocas.
 */
const ABREVIATURAS: Record<string, string> = {
  MIN: 'MINISTERIO',
  MINIST: 'MINISTERIO',
  MINISTE: 'MINISTERIO',
  GOB: 'GOBIERNO',
  ECU: 'ECUADOR',
};

export type ClaseEquipo = 'CHALECO' | 'MUNICION' | 'OTRO';

/**
 * Para sumar «el equipo» de un puesto o de un contrato sin mezclar peras con manzanas: los chalecos son lo que
 * más se cuenta; la munición va aparte; lo demás (alimentadoras, uniformes, implementos) es «otro equipo».
 * El inventario no tiene un campo para «chaleco», así que se reconoce por el nombre del artículo.
 */
export function claseEquipo(nombre: string | null | undefined, tipoArticulo: string | null | undefined): ClaseEquipo {
  if (/CHALECO/.test(normalizarPuesto(nombre))) return 'CHALECO';
  if (tipoArticulo === 'MUNICION') return 'MUNICION';
  return 'OTRO';
}

export interface PuestoBasico {
  id: number;
  nombre: string;
}

/** Nombre normalizado → id, solo de los nombres que identifican a UN puesto de la empresa. */
export function indicePuestosPorNombre(puestos: PuestoBasico[]): Map<string, number> {
  const cuenta = new Map<string, { id: number; n: number }>();
  for (const p of puestos) {
    const k = normalizarPuesto(p.nombre);
    if (!k) continue;
    const previo = cuenta.get(k);
    cuenta.set(k, previo ? { id: previo.id, n: previo.n + 1 } : { id: p.id, n: 1 });
  }
  const indice = new Map<string, number>();
  for (const [k, v] of cuenta) if (v.n === 1) indice.set(k, v.id);
  return indice;
}

/** El puesto de un arma o de un movimiento: su `puestoId` si lo tiene; si no, el que se llama igual. */
export function puestoDeRegistro(
  indice: Map<string, number>,
  puestoId: number | null | undefined,
  puestoNombre: string | null | undefined,
): number | null {
  if (puestoId != null) return puestoId;
  const k = normalizarPuesto(puestoNombre);
  return k ? (indice.get(k) ?? null) : null;
}

/** El puesto de un tenedor de «Quién tiene qué» (clave `P:<id>` o `N:<NOMBRE>`, ver claveTenedor). */
export function puestoDeTenedor(
  indice: Map<string, number>,
  tenedor: string,
  puestoNombre: string | null | undefined,
): number | null {
  if (tenedor.startsWith('P:')) {
    const id = Number(tenedor.slice(2));
    return Number.isInteger(id) ? id : null;
  }
  if (tenedor.startsWith('N:')) return puestoDeRegistro(indice, null, puestoNombre ?? tenedor.slice(2));
  return null;
}
