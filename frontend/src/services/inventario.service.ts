import { api } from './auth.service';
import type {
  Arma,
  Articulo,
  DatosArma,
  DatosArticulo,
  EstadoArma,
  EventoArma,
  MovimientoInventario,
  NuevoMovimiento,
  ResumenInventario,
  Tenencia,
  TipoMovimiento,
} from '../types/inventario';

const BASE = '/operaciones/inventario';

export const getResumenInventario = (): Promise<ResumenInventario> =>
  api.get(`${BASE}/resumen`).then((r) => r.data);

export const getArticulos = (): Promise<Articulo[]> => api.get(`${BASE}/articulos`).then((r) => r.data);
export const crearArticulo = (d: DatosArticulo): Promise<Articulo> => api.post(`${BASE}/articulos`, d).then((r) => r.data);
export const actualizarArticulo = (id: number, d: DatosArticulo): Promise<Articulo> =>
  api.patch(`${BASE}/articulos/${id}`, d).then((r) => r.data);

export const getMovimientos = (f: { articuloId?: number; tipo?: TipoMovimiento; desde?: string; hasta?: string } = {}): Promise<MovimientoInventario[]> =>
  api
    .get(`${BASE}/movimientos`, { params: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')) })
    .then((r) => r.data);
export const registrarMovimiento = (d: NuevoMovimiento): Promise<{ movimientoId: number; stock: number }> =>
  api.post(`${BASE}/movimientos`, d).then((r) => r.data);
export const getTenencias = (articuloId?: number): Promise<Tenencia[]> =>
  api.get(`${BASE}/tenencias`, { params: articuloId ? { articuloId } : undefined }).then((r) => r.data);

export const getArmas = (estado?: EstadoArma): Promise<Arma[]> =>
  api.get(`${BASE}/armas`, { params: estado ? { estado } : undefined }).then((r) => r.data);
export const crearArma = (d: DatosArma): Promise<Arma> => api.post(`${BASE}/armas`, d).then((r) => r.data);
export const actualizarArma = (id: number, d: DatosArma): Promise<Arma> => api.patch(`${BASE}/armas/${id}`, d).then((r) => r.data);
export const getEventosArma = (id: number): Promise<EventoArma[]> => api.get(`${BASE}/armas/${id}/eventos`).then((r) => r.data);
export const asignarArma = (
  id: number,
  d: { puestoId?: number | null; guardiaCedula?: string | null; guardiaNombre?: string | null },
): Promise<Arma> => api.post(`${BASE}/armas/${id}/asignar`, d).then((r) => r.data);
export const devolverArma = (id: number, motivo?: string): Promise<Arma> =>
  api.post(`${BASE}/armas/${id}/devolver`, { motivo }).then((r) => r.data);
export const mantenimientoArma = (id: number, motivo: string): Promise<Arma> =>
  api.post(`${BASE}/armas/${id}/mantenimiento`, { motivo }).then((r) => r.data);
export const reactivarArma = (id: number): Promise<Arma> => api.post(`${BASE}/armas/${id}/reactivar`).then((r) => r.data);
export const bajaArma = (id: number, motivo: string): Promise<Arma> =>
  api.post(`${BASE}/armas/${id}/baja`, { motivo }).then((r) => r.data);
