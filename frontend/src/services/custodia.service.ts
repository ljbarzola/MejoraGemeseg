import { api } from './auth.service';
import { descargarBlob, nombreSeguro } from '../utils/archivos';

export const getCustodias = (params?: any) => api.get('/custodias', { params }).then(r => r.data);
export const getCustodia = (id: number) => api.get(`/custodias/${id}`).then(r => r.data);
export const createCustodia = (data: any) => api.post('/custodias', data).then(r => r.data);
export const updateCustodia = (id: number, data: any) => api.patch(`/custodias/${id}`, data).then(r => r.data);
export const deleteCustodia = (id: number) => api.delete(`/custodias/${id}`);
// `fecha` (ISO) = cuándo salió o llegó de verdad; sin ella el servidor toma el momento de marcar.
export const updateCustodiaEstado = (id: number, estado: string, fecha?: string) => api.patch(`/custodias/${id}/estado`, { estado, fecha }).then(r => r.data);
export const getAvailableCustodios = () => api.get('/custodias/available-custodios').then(r => r.data);

export const getCustodiasDashboard = (mes?: string) => api.get('/custodias/dashboard', { params: { mes } }).then(r => r.data);

// La orden en PDF se pide con el token de sesión (un enlace directo daba 401): ver utils/archivos.ts.
export const descargarOrdenCustodia = async (id: number, numeroGuia: string): Promise<void> => {
  const blob: Blob = await api.get(`/custodias/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
  descargarBlob(blob, `orden_custodia_${nombreSeguro(numeroGuia)}.pdf`);
};
