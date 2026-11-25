import { api } from './auth.service';
import type {
  BitacoraDetalle,
  DatosHojaEnBlanco,
  DotacionDelPuestoCargada,
  EstadoAgenteBitacoras,
  EstadoHallazgo,
  FiltrosBitacoras,
  LecturaParaGuardar,
  ListaBitacoras,
  OpcionPuestoBitacora,
  PuestosDelDia,
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

/** Hoy en los puestos: quién debe estar, si la cobertura se cumple y qué bitácoras faltan por subir. */
export const getPuestosHoy = (fecha?: string): Promise<PuestosDelDia> =>
  api.get(`${BASE}/hoy`, { params: fecha ? { fecha } : undefined }).then((r) => r.data);

export const getBitacora = (id: number): Promise<BitacoraDetalle> =>
  api.get(`${BASE}/${id}`).then((r) => r.data);

/** Sube la foto (o solo el puesto, para transcribir a mano). La lectura con IA tarda: llega ya leída. */
export const subirBitacora = (puestoId: number, archivo: File | null): Promise<BitacoraDetalle> => {
  const fd = new FormData();
  fd.append('puestoId', String(puestoId));
  if (archivo) fd.append('archivo', archivo);
  // El cliente axios manda JSON por defecto: sin este encabezado serializaba el FormData como JSON y el
  // servidor rechazaba la subida («Hay datos no válidos en la solicitud»).
  return api.post(BASE, fd, { timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const guardarLecturaBitacora = (id: number, lectura: LecturaParaGuardar): Promise<BitacoraDetalle> =>
  api.put(`${BASE}/${id}/lectura`, lectura).then((r) => r.data);

export const releerBitacora = (id: number, nota?: string): Promise<BitacoraDetalle> =>
  api.post(`${BASE}/${id}/releer`, nota?.trim() ? { nota: nota.trim() } : {}, { timeout: 120000 }).then((r) => r.data);

export const actualizarHallazgoBitacora = (
  hallazgoId: number,
  estado: EstadoHallazgo,
  nota?: string,
): Promise<BitacoraDetalle> =>
  api.patch(`${BASE}/hallazgos/${hallazgoId}`, { estado, nota }).then((r) => r.data);

/** PDF de la hoja de bitácora en blanco de un puesto, lista para imprimir. */
export const getHojaEnBlanco = (puestoId: number, tipo?: 'PUBLICA' | 'ESTANDAR'): Promise<Blob> =>
  api
    .get(`${BASE}/hoja-en-blanco`, { params: { puestoId, ...(tipo ? { tipo } : {}) }, responseType: 'blob' })
    .then((r) => r.data);

/** Los datos que llevará la hoja en blanco, para revisarlos antes de imprimir. */
export const getDatosHojaEnBlanco = (puestoId: number, tipo?: 'PUBLICA' | 'ESTANDAR'): Promise<DatosHojaEnBlanco> =>
  api.get(`${BASE}/hoja-en-blanco/datos`, { params: { puestoId, ...(tipo ? { tipo } : {}) } }).then((r) => r.data);

/** Dotación del puesto para cargarla a mano antes de las hojas. */
export const getDotacionDelPuesto = (puestoId: number): Promise<DotacionDelPuestoCargada> =>
  api.get(`${BASE}/puestos/${puestoId}/dotacion`).then((r) => r.data);

export const agregarADotacionDelPuesto = (
  puestoId: number,
  fila: { ambito: 'GEMESEG' | 'CLIENTE'; articulo: string; cantidad: number | null },
): Promise<DotacionDelPuestoCargada> => api.post(`${BASE}/puestos/${puestoId}/dotacion`, fila).then((r) => r.data);

export const actualizarDotacionDelPuesto = (
  puestoId: number,
  filaId: number,
  cambios: { ambito?: 'GEMESEG' | 'CLIENTE'; articulo?: string; cantidad?: number | null },
): Promise<DotacionDelPuestoCargada> => api.patch(`${BASE}/puestos/${puestoId}/dotacion/${filaId}`, cambios).then((r) => r.data);

export const quitarDotacionDelPuesto = (puestoId: number, filaId: number): Promise<DotacionDelPuestoCargada> =>
  api.delete(`${BASE}/puestos/${puestoId}/dotacion/${filaId}`).then((r) => r.data);

/** Dice de quién es un artículo «Nuevo" de la hoja: queda registrado en la dotación del puesto. */
export const clasificarDotacionBitacora = (id: number, dotacionId: number, ambito: 'GEMESEG' | 'CLIENTE'): Promise<BitacoraDetalle> =>
  api.post(`${BASE}/${id}/dotacion/${dotacionId}/clasificar`, { ambito }).then((r) => r.data);

/** Quita un artículo de la lista del puesto (por ejemplo, uno clasificado por error). */
export const quitarDeLaDotacionDelPuesto = (id: number, filaId: number): Promise<BitacoraDetalle> =>
  api.delete(`${BASE}/${id}/dotacion-puesto/${filaId}`).then((r) => r.data);

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
