import { api } from './auth.service';

export interface SistemaVerificacion {
  id: number;
  nombre: string;
  urlPortal: string | null;
  activo: boolean;
  orden: number;
  companyId: number;
  createdAt: string;
  updatedAt: string;
}

export type TipoMovimientoPersonal = 'ENTRADA' | 'SALIDA';
export type EstadoMovimientoPersonal = 'EN_PROCESO' | 'COMPLETADO';

export interface MovimientoPersonalItem {
  id: number;
  movimientoId: number;
  sistemaVerificacionId: number | null;
  nombreSistema: string;
  completado: boolean;
  notas: string | null;
  completadoPor: number | null;
  completadoAt: string | null;
  createdAt: string;
}

export interface MovimientoPersonal {
  id: number;
  cedula: string;
  nombreGuardia: string;
  tipo: TipoMovimientoPersonal;
  estado: EstadoMovimientoPersonal;
  origen: string;
  candidateId: number | null;
  companyId: number;
  createdBy: number;
  creator?: { id: number; fullName: string };
  createdAt: string;
  completadoAt: string | null;
  items: MovimientoPersonalItem[];
}

export const getSistemasVerificacion = () =>
  api.get('/personal/sistemas-verificacion').then((r) => r.data as SistemaVerificacion[]);
export const createSistemaVerificacion = (data: { nombre: string; urlPortal?: string; orden?: number }) =>
  api.post('/personal/sistemas-verificacion', data).then((r) => r.data as SistemaVerificacion);
export const updateSistemaVerificacion = (id: number, data: { nombre?: string; urlPortal?: string; activo?: boolean; orden?: number }) =>
  api.patch(`/personal/sistemas-verificacion/${id}`, data).then((r) => r.data as SistemaVerificacion);
export const deleteSistemaVerificacion = (id: number) => api.delete(`/personal/sistemas-verificacion/${id}`);

export const getMovimientos = (params?: { tipo?: TipoMovimientoPersonal; estado?: EstadoMovimientoPersonal; cedula?: string }) =>
  api.get('/personal/movimientos', { params }).then((r) => r.data as MovimientoPersonal[]);
export const getMovimiento = (id: number) =>
  api.get(`/personal/movimientos/${id}`).then((r) => r.data as MovimientoPersonal);
export const registrarSalida = (data: { cedula: string; nombreGuardia: string }) =>
  api.post('/personal/movimientos/salida', data).then((r) => r.data as MovimientoPersonal);
export const getCedulasFuera = () =>
  api.get('/personal/movimientos/guardias-fuera').then((r) => r.data as string[]);
export const toggleMovimientoItem = (movimientoId: number, itemId: number, data: { completado: boolean; notas?: string }) =>
  api.patch(`/personal/movimientos/${movimientoId}/items/${itemId}`, data).then((r) => r.data as MovimientoPersonal);
