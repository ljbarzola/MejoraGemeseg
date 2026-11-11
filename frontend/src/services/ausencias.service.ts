import { api } from './auth.service';
import type { AusenciaRegistrada, MotivoAusencia, SugerenciaReemplazo } from '../types/bitacoras';

const BASE = '/contratacion-publica/ausencias';

export interface NuevaAusencia {
  puestoId: number;
  cedula: string;
  fecha?: string;
  motivo: MotivoAusencia;
  hora?: string | null;
  nota?: string | null;
  reemplazoCedula?: string | null;
  reemplazoNombre?: string | null;
}

/** Quién podría cubrir a un guardia ese día (solo sugiere). */
export const getSugerenciasAusencia = (puestoId: number, cedula: string, fecha?: string): Promise<SugerenciaReemplazo[]> =>
  api.get(`${BASE}/sugerencias`, { params: { puestoId, cedula, ...(fecha ? { fecha } : {}) } }).then((r) => r.data);

export const registrarAusencia = (d: NuevaAusencia): Promise<AusenciaRegistrada> => api.post(BASE, d).then((r) => r.data);

export const cubrirAusencia = (id: number, reemplazoCedula: string, reemplazoNombre: string): Promise<AusenciaRegistrada> =>
  api.post(`${BASE}/${id}/cubrir`, { reemplazoCedula, reemplazoNombre }).then((r) => r.data);

export const anularAusencia = (id: number, nota?: string): Promise<AusenciaRegistrada> =>
  api.post(`${BASE}/${id}/anular`, { nota }).then((r) => r.data);
