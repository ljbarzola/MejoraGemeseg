/**
 * Reglas fijas del inventario de Operaciones (uniformes, implementos, municiones y armas).
 * Todo es código: no hay IA en las cuentas. Cada artículo lleva un kardex (entradas, entregas,
 * devoluciones, bajas y ajustes) y el saldo se calcula siempre desde los movimientos, nunca se guarda.
 */

export const TIPOS_ARTICULO = ['UNIFORME', 'IMPLEMENTO', 'MUNICION'] as const;
export type TipoArticulo = (typeof TIPOS_ARTICULO)[number];

export const TIPOS_MOVIMIENTO = ['ENTRADA', 'ENTREGA', 'DEVOLUCION', 'BAJA', 'AJUSTE'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ESTADOS_ARMA = ['DISPONIBLE', 'ASIGNADA', 'MANTENIMIENTO', 'BAJA'] as const;
export type EstadoArma = (typeof ESTADOS_ARMA)[number];

/** Días de aviso antes de que venza el permiso de un arma. */
export const DIAS_AVISO_PERMISO = 30;

/** «1 unidad», «2 unidades», «3 pares», «5 cartuchos»: plural simple de la unidad de medida. */
export function pluralUnidad(unidad: string, cantidad: number): string {
  if (Math.abs(cantidad) === 1) return unidad;
  return /[lrdznj]$/i.test(unidad) ? `${unidad}es` : `${unidad}s`;
}

export interface Tenedor {
  puestoId?: number | null;
  guardiaCedula?: string | null;
}

/** Quien tiene el material: un guardia (si hay cédula) o, si no, un puesto. null = sin tenedor (bodega). */
export function claveTenedor(t: Tenedor): string | null {
  const cedula = (t.guardiaCedula ?? '').trim();
  if (cedula) return `G:${cedula}`;
  if (t.puestoId != null) return `P:${t.puestoId}`;
  return null;
}

export interface MovimientoCalculo {
  tipo: string;
  cantidad: number;
  /** Clave de tenedor ya calculada (ver claveTenedor), null si el movimiento no es de un tenedor. */
  tenedor: string | null;
}

/**
 * Efecto de un movimiento en la bodega:
 * ENTRADA y DEVOLUCION suman; ENTREGA resta; BAJA resta solo si salió de la bodega (sin tenedor);
 * AJUSTE trae su propio signo (corrige un conteo de la bodega).
 */
export function efectoBodega(m: MovimientoCalculo): number {
  switch (m.tipo) {
    case 'ENTRADA':
    case 'DEVOLUCION':
      return m.cantidad;
    case 'ENTREGA':
      return -m.cantidad;
    case 'BAJA':
      return m.tenedor ? 0 : -m.cantidad;
    case 'AJUSTE':
      return m.cantidad;
    default:
      return 0;
  }
}

/** Efecto en lo que tiene un tenedor: la entrega suma; devolver y dar de baja desde él restan. */
export function efectoTenedor(m: MovimientoCalculo): number {
  if (!m.tenedor) return 0;
  switch (m.tipo) {
    case 'ENTREGA':
      return m.cantidad;
    case 'DEVOLUCION':
    case 'BAJA':
      return -m.cantidad;
    default:
      return 0;
  }
}

export function saldoBodega(movs: MovimientoCalculo[]): number {
  return movs.reduce((acc, m) => acc + efectoBodega(m), 0);
}

/** Lo que tiene cada tenedor (solo los que tienen algo). */
export function saldosPorTenedor(movs: MovimientoCalculo[]): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const m of movs) {
    const e = efectoTenedor(m);
    if (e === 0 || !m.tenedor) continue;
    saldos.set(m.tenedor, (saldos.get(m.tenedor) ?? 0) + e);
  }
  for (const [k, v] of saldos) if (v <= 0) saldos.delete(k);
  return saldos;
}

export function totalEntregado(movs: MovimientoCalculo[]): number {
  let total = 0;
  for (const v of saldosPorTenedor(movs).values()) total += v;
  return total;
}

export type EstadoStock = 'SIN_STOCK' | 'BAJO_MINIMO' | 'NORMAL' | 'SOBRE_MAXIMO';

/**
 * Sin existencias; en el mínimo o por debajo; sobre el máximo (si hay máximo); o normal.
 * Un artículo con mínimo 0 solo avisa cuando se agota.
 */
export function estadoStock(stock: number, minimo: number, maximo: number | null): EstadoStock {
  if (stock <= 0) return 'SIN_STOCK';
  if (minimo > 0 && stock <= minimo) return 'BAJO_MINIMO';
  if (maximo != null && maximo > 0 && stock > maximo) return 'SOBRE_MAXIMO';
  return 'NORMAL';
}

/**
 * Cuánto comprar para volver a lo normal: hasta el máximo si hay; si no, hasta el doble del mínimo.
 * 0 cuando no hace falta reponer.
 */
export function reposicionSugerida(stock: number, minimo: number, maximo: number | null): number {
  // Sin mínimo ni máximo no hay referencia para sugerir nada.
  if (minimo <= 0 && (maximo == null || maximo <= 0)) return 0;
  const objetivo = maximo != null && maximo > 0 ? maximo : minimo * 2;
  if (stock > minimo) return 0;
  return Math.max(0, objetivo - stock);
}

/** true si este movimiento hace que el stock pase a estar en el mínimo o por debajo (antes no lo estaba). */
export function cruzaMinimo(antes: number, despues: number, minimo: number): boolean {
  if (minimo <= 0) return antes > 0 && despues <= 0;
  return antes > minimo && despues <= minimo;
}

export type EstadoPermiso = 'SIN_PERMISO' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

/** `vence` y `hoy` son días AAAA-MM-DD (hoy es el día de Ecuador). */
export function estadoPermiso(vence: string | null | undefined, hoy: string): EstadoPermiso {
  if (!vence) return 'SIN_PERMISO';
  if (vence < hoy) return 'VENCIDO';
  return diasEntre(hoy, vence) <= DIAS_AVISO_PERMISO ? 'POR_VENCER' : 'VIGENTE';
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Un arma solo cambia de estado por estas vías. Devuelve el motivo si no se puede, o null si sí. */
export function motivoNoSePuede(
  accion: 'ASIGNAR' | 'DEVOLVER' | 'MANTENIMIENTO' | 'REACTIVAR' | 'BAJA',
  estado: string,
  permiso: EstadoPermiso,
): string | null {
  if (estado === 'BAJA') return 'Esta arma ya está dada de baja.';
  switch (accion) {
    case 'ASIGNAR':
      if (estado === 'ASIGNADA') return 'Esta arma ya está asignada: primero devuélvela.';
      if (estado === 'MANTENIMIENTO') return 'Esta arma está en mantenimiento.';
      if (permiso === 'VENCIDO') return 'El permiso de esta arma está vencido: renuévalo antes de asignarla.';
      return null;
    case 'DEVOLVER':
      return estado === 'ASIGNADA' ? null : 'Esta arma no está asignada.';
    case 'MANTENIMIENTO':
      if (estado === 'ASIGNADA') return 'Esta arma está asignada: primero devuélvela.';
      if (estado === 'MANTENIMIENTO') return 'Esta arma ya está en mantenimiento.';
      return null;
    case 'REACTIVAR':
      return estado === 'MANTENIMIENTO' ? null : 'Esta arma no está en mantenimiento.';
    case 'BAJA':
      return estado === 'ASIGNADA' ? 'Esta arma está asignada: primero devuélvela.' : null;
  }
}
