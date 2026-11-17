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

export interface NuevaPersonaCustodia {
  nombre: string;
  cedula?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  contactoEmergenciaNombre?: string;
  contactoEmergenciaTelefono?: string;
}
/** Persona nueva desde el formulario del viaje: entra a los Guardias de RRHH (sin carpeta de Drive todavía). */
export const crearPersonaCustodia = (data: NuevaPersonaCustodia) =>
  api.post('/custodias/personal', data).then(r => r.data as { name: string; cedula: string; sinCedula: boolean; status: string; yaExistia: boolean });

export const getCustodiasDashboard = (mes?: string) => api.get('/custodias/dashboard', { params: { mes } }).then(r => r.data);

// La orden en PDF se pide con el token de sesión (un enlace directo daba 401): ver utils/archivos.ts.
export const descargarOrdenCustodia = async (id: number, numeroGuia: string): Promise<void> => {
  const blob: Blob = await api.get(`/custodias/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
  descargarBlob(blob, `orden_custodia_${nombreSeguro(numeroGuia)}.pdf`);
};
