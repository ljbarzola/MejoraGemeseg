import { api } from './auth.service';
import type {
  CandidatoSupervisor,
  Cronograma,
  CronogramaResumen,
  GuardiaPresente,
  MisVisitasHoy,
  SinVisita,
  VisitaSupervision,
} from '../types/supervision';

const BASE = '/contratacion-publica/supervision';

export const getCandidatosSupervisor = (): Promise<CandidatoSupervisor[]> =>
  api.get(`${BASE}/candidatos`).then((r) => r.data);

export const getCronogramas = (contratoId?: number): Promise<CronogramaResumen[]> =>
  api.get(`${BASE}/cronogramas`, { params: { contratoId } }).then((r) => r.data);

export const getCronograma = (id: number): Promise<Cronograma> =>
  api.get(`${BASE}/cronogramas/${id}`).then((r) => r.data);

export const crearCronograma = (data: { contratoId: number; fechaInicio: string; fechaFin: string }): Promise<Cronograma> =>
  api.post(`${BASE}/cronogramas`, data).then((r) => r.data);

export const eliminarCronograma = (id: number) => api.delete(`${BASE}/cronogramas/${id}`);

export const editarPuntoCronograma = (
  id: number,
  puntoId: number,
  data: { supervisorUserId?: number | null; supervisorNombre?: string; jornada?: string },
): Promise<Cronograma> => api.patch(`${BASE}/cronogramas/${id}/puntos/${puntoId}`, data).then((r) => r.data);

export const reemplazarDiasPunto = (id: number, puntoId: number, fechas: string[]): Promise<Cronograma> =>
  api.put(`${BASE}/cronogramas/${id}/puntos/${puntoId}/dias`, { fechas }).then((r) => r.data);

export const getCronogramaExcelBlob = (id: number): Promise<Blob> =>
  api.get(`${BASE}/cronogramas/${id}/excel`, { responseType: 'blob' }).then((r) => r.data);

export const getMisVisitasHoy = (): Promise<MisVisitasHoy> => api.get(`${BASE}/mis-visitas-hoy`).then((r) => r.data);

export const getSinVisita = (dias = 7): Promise<SinVisita> => api.get(`${BASE}/sin-visita`, { params: { dias } }).then((r) => r.data);

export const getVisitas = (params: { puestoId?: number; desde?: string; hasta?: string } = {}): Promise<VisitaSupervision[]> =>
  api.get(`${BASE}/visitas`, { params }).then((r) => r.data);

export const registrarVisita = (data: {
  puestoId: number;
  guardiaPresente: GuardiaPresente;
  observacion?: string;
  fecha?: string;
  hora?: string;
  foto?: File | null;
}): Promise<VisitaSupervision> => {
  const form = new FormData();
  form.append('puestoId', String(data.puestoId));
  form.append('guardiaPresente', data.guardiaPresente);
  if (data.observacion?.trim()) form.append('observacion', data.observacion.trim());
  if (data.fecha) form.append('fecha', data.fecha);
  if (data.hora) form.append('hora', data.hora);
  if (data.foto) form.append('foto', data.foto);
  return api.post(`${BASE}/visitas`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const eliminarVisita = (id: number) => api.delete(`${BASE}/visitas/${id}`);

/** La foto se pide con la sesión: se baja como imagen y se muestra desde una URL temporal. */
export const getFotoVisitaBlob = (id: number): Promise<Blob> =>
  api.get(`${BASE}/visitas/${id}/foto`, { responseType: 'blob' }).then((r) => r.data);
