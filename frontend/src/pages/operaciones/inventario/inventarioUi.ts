import { fechaCorta } from '../../../utils/bitacoras';
import type { EstadoArma, EstadoPermiso, EstadoStock, TipoMovimiento } from '../../../types/inventario';

// Colores de las insignias del inventario, en un solo sitio para que todas las pestañas se vean igual.
export const COLOR_STOCK: Record<EstadoStock, { bg: string; fg: string }> = {
  SIN_STOCK: { bg: '#fed7d7', fg: '#c53030' },
  BAJO_MINIMO: { bg: '#feebc8', fg: '#c05621' },
  NORMAL: { bg: '#c6f6d5', fg: '#276749' },
  SOBRE_MAXIMO: { bg: '#bee3f8', fg: '#2b6cb0' },
};

export const COLOR_ARMA: Record<EstadoArma, { bg: string; fg: string }> = {
  DISPONIBLE: { bg: '#c6f6d5', fg: '#276749' },
  ASIGNADA: { bg: '#bee3f8', fg: '#2b6cb0' },
  MANTENIMIENTO: { bg: '#feebc8', fg: '#c05621' },
  BAJA: { bg: '#e2e8f0', fg: '#4a5568' },
};

export const COLOR_PERMISO: Record<EstadoPermiso, { bg: string; fg: string }> = {
  VIGENTE: { bg: '#c6f6d5', fg: '#276749' },
  POR_VENCER: { bg: '#feebc8', fg: '#c05621' },
  VENCIDO: { bg: '#fed7d7', fg: '#c53030' },
  SIN_PERMISO: { bg: '#e2e8f0', fg: '#4a5568' },
};

export const COLOR_MOVIMIENTO: Record<TipoMovimiento, { bg: string; fg: string }> = {
  ENTRADA: { bg: '#c6f6d5', fg: '#276749' },
  ENTREGA: { bg: '#bee3f8', fg: '#2b6cb0' },
  DEVOLUCION: { bg: '#e9d8fd', fg: '#6b46c1' },
  BAJA: { bg: '#fed7d7', fg: '#c53030' },
  AJUSTE: { bg: '#fefcbf', fg: '#975a16' },
};

/** «1 unidad», «2 unidades», «3 pares»: plural simple de la unidad de medida. */
export function pluralUnidad(unidad: string, cantidad: number): string {
  if (Math.abs(cantidad) === 1) return unidad;
  return /[lrdznj]$/i.test(unidad) ? `${unidad}es` : `${unidad}s`;
}

export const formatoFecha = (iso: string | null | undefined): string => fechaCorta(iso);

export function nombreArticulo(nombre: string, variante: string): string {
  return variante ? `${nombre} · ${variante}` : nombre;
}

/** Texto de error de una llamada: el del servidor si lo hay, si no uno corto. */
export function mensajeError(err: unknown, porDefecto: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(m)) return m[0] || porDefecto;
  return m || porDefecto;
}

/** Fecha de hoy en Ecuador (UTC-5), AAAA-MM-DD. */
export function hoyEcuador(): string {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
}
