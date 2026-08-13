import { api } from './auth.service';

export const getCustodias = (params?: any) => api.get('/custodias', { params }).then(r => r.data);
export const getCustodia = (id: number) => api.get(`/custodias/${id}`).then(r => r.data);
export const createCustodia = (data: any) => api.post('/custodias', data).then(r => r.data);
export const deleteCustodia = (id: number) => api.delete(`/custodias/${id}`);
export const updateCustodiaEstado = (id: number, estado: string) => api.patch(`/custodias/${id}/estado`, { estado }).then(r => r.data);
export const getAvailableCustodios = () => api.get('/custodias/available-custodios').then(r => r.data);
export const getNomina = (params: any) => api.get('/custodias/nomina', { params }).then(r => r.data);

export const getCustodiasDashboard = (mes?: string) => api.get('/custodias/dashboard', { params: { mes } }).then(r => r.data);
export const getTrabajadorByCedula = (cedula: string, mes?: string) => api.get('/custodias/trabajador', { params: { cedula, mes } }).then(r => r.data);
export const queryGemeBot = (mensaje: string) => api.post('/custodias/gemebot/query', { mensaje }).then(r => r.data);

export const getCustodiaPdfUrl = (id: number) => `${import.meta.env.VITE_API_URL}/custodias/${id}/pdf`;
export const getNominaPdfUrl = (params: { fechaInicio: string; fechaFin: string; cedula?: string; todos?: boolean }) => {
  const p = new URLSearchParams({ fechaInicio: params.fechaInicio, fechaFin: params.fechaFin });
  if (params.cedula) p.set('cedula', params.cedula);
  if (params.todos) p.set('todos', 'true');
  return `${import.meta.env.VITE_API_URL}/custodias/nomina/pdf?${p.toString()}`;
};
