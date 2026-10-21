import { api } from './auth.service';
import type {
  BitacoraDetalle,
  EstadoAgenteBitacoras,
  EstadoHallazgo,
  FiltrosBitacoras,
  LecturaParaGuardar,
  ListaBitacoras,
  OpcionPuestoBitacora,
  ResumenBitacoras,
} from '../types/bitacoras';
import type { CPCodigoTurno } from '../types/contratacion-publica';

const BASE = '/contratacion-publica/bitacoras';

const limpiar = (f: FiltrosBitacoras) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));

export const getOpcionesBitacora = (): Promise<OpcionPuestoBitacora[]> =>
  api.get(`${BASE}/opciones`).then((r) => r.data);

export const getAgenteBitacoras = (): Promise<EstadoAgenteBitacoras> =>
  api.get(`${BASE}/agente`).then((r) => r.data);

export const getBitacoras = (
  filtros: FiltrosBitacoras & { page?: number; pageSize?: number },
): Promise<ListaBitacoras> =>
  api.get(BASE, { params: limpiar(filtros) }).then((r) => r.data);

export const getResumenBitacoras = (filtros: FiltrosBitacoras): Promise<ResumenBitacoras> =>
  api.get(`${BASE}/dashboard`, { params: limpiar(filtros) }).then((r) => r.data);

export const getBitacora = (id: number): Promise<BitacoraDetalle> =>
  api.get(`${BASE}/${id}`).then((r) => r.data);

/** Sube la foto (o solo el puesto, para transcribir a mano). La lectura con IA tarda: llega ya leída. */
export const subirBitacora = (puestoId: number, archivo: File | null): Promise<BitacoraDetalle> => {
  const fd = new FormData();
  fd.append('puestoId', String(puestoId));
  if (archivo) fd.append('archivo', archivo);
  return api.post(BASE, fd, { timeout: 120000 }).then((r) => r.data);
};

export const guardarLecturaBitacora = (id: number, lectura: LecturaParaGuardar): Promise<BitacoraDetalle> =>
  api.put(`${BASE}/${id}/lectura`, lectura).then((r) => r.data);

export const releerBitacora = (id: number): Promise<BitacoraDetalle> =>
  api.post(`${BASE}/${id}/releer`, undefined, { timeout: 120000 }).then((r) => r.data);

export const actualizarHallazgoBitacora = (
  hallazgoId: number,
  estado: EstadoHallazgo,
  nota?: string,
): Promise<BitacoraDetalle> =>
  api.patch(`${BASE}/hallazgos/${hallazgoId}`, { estado, nota }).then((r) => r.data);

export const eliminarBitacora = (id: number): Promise<{ ok: boolean }> =>
  api.delete(`${BASE}/${id}`).then((r) => r.data);

export const getArchivoBitacora = (id: number): Promise<Blob> =>
  api.get(`${BASE}/${id}/archivo`, { responseType: 'blob' }).then((r) => r.data);

// Horario de cada turno (lo usa el revisor para comparar horas): se guarda en el
// código de turno, con el mismo endpoint de siempre.
export const getCodigosTurnoBitacoras = (): Promise<CPCodigoTurno[]> =>
  api.get('/contratacion-publica/codigos-turno').then((r) => r.data);

export const guardarHorasTurno = (
  id: number,
  horaInicio: string | null,
  horaFin: string | null,
): Promise<CPCodigoTurno> =>
  api.patch(`/contratacion-publica/codigos-turno/${id}`, { horaInicio, horaFin }).then((r) => r.data);
