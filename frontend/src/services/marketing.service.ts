import { api } from './auth.service';
import type {
  MarketingCampaniaDetalle,
  MarketingCampaniaResumen,
  MarketingConfiguracion,
  MarketingEnvio,
} from '../types/marketing';

export const listarCampanias = () =>
  api.get<MarketingCampaniaResumen[]>('/marketing').then((r) => r.data);

export const crearCampania = (idea: string, objetivo?: string, duplicarDe?: number) =>
  api
    .post<MarketingCampaniaDetalle>('/marketing', {
      idea,
      objetivo: objetivo || undefined,
      duplicarDe,
    })
    .then((r) => r.data);

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

export const generarImagenPieza = (id: number) =>
  api.post<MarketingCampaniaDetalle>(`/marketing/piezas/${id}/imagen`).then((r) => r.data);

export const descargarImagenPieza = async (id: number) => {
  const respuesta = await api.get<Blob>(`/marketing/piezas/${id}/archivo`, { responseType: 'blob' });
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
}) => api.put<MarketingConfiguracion>('/marketing/configuracion', data).then((r) => r.data);
