import { api } from './auth.service';
import type {
  MarketingCanalExtra,
  MarketingCampaniaDetalle,
  MarketingCampaniaResumen,
  MarketingConexion,
  MarketingConfiguracion,
  MarketingEnvio,
  MarketingPiezaCalendario,
  MarketingPropuesta,
  MarketingRadar,
  MarketingRequerimiento,
  MarketingRecurso,
  MarketingRecursoTipo,
  MarketingRespuestaEntrevista,
  MarketingResumen,
  MarketingSiguientePregunta,
  MarketingSugerenciaCanales,
} from '../types/marketing';

export const listarCampanias = () =>
  api.get<MarketingCampaniaResumen[]>('/marketing').then((r) => r.data);

export interface OpcionesCampania {
  canales?: string[];
  canalesExtra?: string[];
  presupuestoMensual?: number;
  fechaInicio?: string;
}

export const crearCampania = (
  idea: string,
  objetivo?: string,
  duplicarDe?: number,
  entrevista?: MarketingRespuestaEntrevista[],
  opciones: OpcionesCampania = {},
) =>
  api
    .post<MarketingCampaniaDetalle>('/marketing', {
      idea,
      objetivo: objetivo || undefined,
      duplicarDe,
      entrevista: entrevista?.length ? entrevista : undefined,
      canales: opciones.canales?.length ? opciones.canales : undefined,
      canalesExtra: opciones.canalesExtra?.length ? opciones.canalesExtra : undefined,
      presupuestoMensual: opciones.presupuestoMensual || undefined,
      fechaInicio: opciones.fechaInicio || undefined,
    })
    .then((r) => r.data);

export const sugerirCanales = (idea: string, objetivo: string | undefined, respuestas: MarketingRespuestaEntrevista[]) =>
  api
    .post<MarketingSugerenciaCanales>('/marketing/canales/sugerir', { idea, objetivo: objetivo || undefined, respuestas })
    .then((r) => r.data);

export const clasificarCanalExtra = (nombre: string) =>
  api.post<MarketingCanalExtra>('/marketing/canales/clasificar-extra', { nombre }).then((r) => r.data);

export const getResumenMarketing =() => api.get<MarketingResumen>('/marketing/resumen').then((r) => r.data);

export const listarConexiones = () => api.get<MarketingConexion[]>('/marketing/conexiones').then((r) => r.data);

export const cambiarConexion = (canal: string, accion: 'DEMO' | 'SOLICITAR' | 'DESCONECTAR', detalle?: string) =>
  api.post<MarketingConexion[]>(`/marketing/conexiones/${canal}`, { accion, detalle: detalle || undefined }).then((r) => r.data);

export const listarRequerimientos = () =>
  api.get<MarketingRequerimiento[]>('/marketing/requerimientos').then((r) => r.data);

export const crearRequerimiento = (tipo: 'CANAL' | 'INTEGRACION' | 'NECESIDAD', detalle: string, canal?: string) =>
  api.post<MarketingRequerimiento[]>('/marketing/requerimientos', { tipo, detalle, canal: canal || undefined }).then((r) => r.data);

export const getCalendarioMarketing = (desde: string, hasta: string) =>
  api.get<MarketingPiezaCalendario[]>('/marketing/calendario', { params: { desde, hasta } }).then((r) => r.data);

export const moverPiezaCalendario = (id: number, fecha: string) =>
  api.patch<{ id: number; fecha: string }>(`/marketing/piezas/${id}/fecha`, { fecha }).then((r) => r.data);

export const listarPropuestas = () => api.get<MarketingPropuesta[]>('/marketing/propuestas').then((r) => r.data);

export const generarPropuestas = () => api.post<MarketingPropuesta[]>('/marketing/propuestas/generar').then((r) => r.data);

export const aceptarPropuesta = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/propuestas/${id}/aceptar`).then((r) => r.data);

export const descartarPropuesta = (id: number) =>
  api.post<MarketingPropuesta[]>(`/marketing/propuestas/${id}/descartar`).then((r) => r.data);

export const getRadar = () => api.get<MarketingRadar>('/marketing/radar').then((r) => r.data);

export const generarRadar = (competidores?: string) =>
  api.post<MarketingRadar>('/marketing/radar/generar', { competidores }).then((r) => r.data);

export const publicarEnvio = (id: number, programadoPara?: string) =>
  api.post<MarketingEnvio[]>(`/marketing/envios/${id}/publicar`, { programadoPara: programadoPara || undefined }).then((r) => r.data);

export const publicarTodo = (campaignId: number) =>
  api.post<MarketingEnvio[]>(`/marketing/${campaignId}/publicar-todo`).then((r) => r.data);

export const siguientePreguntaEntrevista = (
  idea: string,
  objetivo: string | undefined,
  respuestas: MarketingRespuestaEntrevista[],
) =>
  api
    .post<MarketingSiguientePregunta>('/marketing/entrevista/siguiente', {
      idea,
      objetivo: objetivo || undefined,
      respuestas,
    })
    .then((r) => r.data);

export const recuperarPieza = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/piezas/${id}/recuperar`).then((r) => r.data);

export const getCampania = (id: number) =>
  api.get<MarketingCampaniaDetalle>(`/marketing/${id}`).then((r) => r.data);

export interface PiezaBiblioteca {
  id: number;
  campaignId: number;
  campania: string;
  tipo: string;
  canal: string | null;
  titulo: string | null;
  contenido: string;
  estado: string;
  aprobadoEn: string | null;
  createdAt: string;
}

export const listarBiblioteca = (estado?: string) =>
  api.get<PiezaBiblioteca[]>('/marketing/biblioteca', { params: estado ? { estado } : {} }).then((r) => r.data);

export const aprobarCampania = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/${id}/aprobar`).then((r) => r.data);

export const regenerarCampania = (id: number, feedback?: string) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/${id}/regenerar`, { feedback: feedback || undefined }).then((r) => r.data);

export const desaprobarCampania = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/${id}/desaprobar`).then((r) => r.data);

export const editarPieza = (id: number, contenido: string, titulo?: string) =>
  api
    .patch<MarketingCampaniaDetalle>(`/marketing/piezas/${id}`, {
      contenido,
      titulo,
    })
    .then((r) => r.data);

export const descartarPieza = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/piezas/${id}/descartar`).then((r) => r.data);

export const generarVideoPieza = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/piezas/${id}/video`).then((r) => r.data);

export const eliminarCampania = (id: number) =>
  api.delete<{ eliminada: boolean }>(`/marketing/${id}`).then((r) => r.data);

export const generarImagenPieza = (id: number, feedback?: string) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/piezas/${id}/imagen`, { feedback: feedback || undefined }).then((r) => r.data);

/** `version` (el nombre del archivo) cambia al rehacer la imagen: evita que el navegador muestre la vieja de su caché. */
export const descargarImagenPieza = async (id: number, version?: string | null) => {
  const respuesta = await api.get<Blob>(`/marketing/piezas/${id}/archivo`, {
    responseType: 'blob',
    params: version ? { v: version } : undefined,
  });
  return URL.createObjectURL(respuesta.data);
};

export const listarEnvios = (campaignId?: number) =>
  api.get<MarketingEnvio[]>('/marketing/envios', { params: campaignId ? { campania: campaignId } : {} }).then((r) => r.data);

export const listarEnviosDeCampana = (campaignId: number) =>
  api.get<MarketingEnvio[]>(`/marketing/${campaignId}/envios`).then((r) => r.data);

export const prepararEnvios = (campaignId: number) =>
  api.post<MarketingEnvio[]>(`/marketing/${campaignId}/preparar-envios`).then((r) => r.data);

export const omitirEnvio = (id: number) =>
  api.post<MarketingEnvio[]>(`/marketing/envios/${id}/omitir`).then((r) => r.data);

export const getConfiguracionMarketing = () =>
  api.get<MarketingConfiguracion>('/marketing/configuracion').then((r) => r.data);

export const guardarConfiguracionMarketing = (data: {
  tono?: string;
  servicios?: string;
  canalesPermitidos?: string;
  consentimiento?: string;
  aprobadorDistinto?: boolean;
  sitioWeb?: string;
  redesSociales?: string;
  herramientas?: string;
  resumenWeb?: string;
}) => api.put<MarketingConfiguracion>('/marketing/configuracion', data).then((r) => r.data);

/** Lee la web guardada en la configuración (10 a 20 s) y guarda el resumen. */
export const leerWebMarketing = () =>
  api
    .post<{ sitioWeb: string; resumenWeb: string }>('/marketing/configuracion/leer-web', undefined, { timeout: 90000 })
    .then((r) => r.data);

export const listarRecursos = () => api.get<MarketingRecurso[]>('/marketing/recursos').then((r) => r.data);

export const subirRecurso = (archivo: File, tipo: MarketingRecursoTipo, descripcion?: string) => {
  const form = new FormData();
  form.append('archivo', archivo);
  form.append('tipo', tipo);
  if (descripcion?.trim()) form.append('descripcion', descripcion.trim());
  return api
    .post<MarketingRecurso>('/marketing/recursos', form, { timeout: 120000 })
    .then((r) => r.data);
};

export const eliminarRecurso = (id: number) =>
  api.delete<{ eliminado: boolean }>(`/marketing/recursos/${id}`).then((r) => r.data);

/** El archivo pide el JWT: se baja como blob y se devuelve una URL local (quien la use debe revocarla). */
export const descargarRecurso = async (id: number) => {
  const respuesta = await api.get<Blob>(`/marketing/recursos/${id}/archivo`, { responseType: 'blob' });
  return URL.createObjectURL(respuesta.data);
};
