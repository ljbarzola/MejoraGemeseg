/**
 * Enlace entre el inventario y los puestos de servicio (2026-11-23).
 *
 * La carga desde el Excel de Operaciones guarda el puesto de cada arma y de cada chaleco con su NOMBRE.
 * Cuando ese puesto existe en la aplicación se enlaza por nombre; si no existe todavía, queda solo el
 * nombre y el contrato lo encuentra igual al comparar nombres. Solo se enlaza por nombre cuando es
 * inequívoco: si dos puestos de la empresa se llaman igual (en contratos distintos), no se adivina.
 */

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nombre de puesto comparable: sin tildes, en mayúsculas y con los espacios normalizados. */
export function normalizarPuesto(nombre: string | null | undefined): string {
  return quitarTildes(nombre ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
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
