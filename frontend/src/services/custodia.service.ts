import { api } from './auth.service';
import { descargarBlob, nombreSeguro } from '../utils/archivos';
import type { CampoGuia, CampoGuiaForm, ClienteDirectorio, ConfigCustodias, DatosEnvio, EnvioGuia, MomentoFirma, RutaCustodia } from '../types/custodiaGuia';
import type { CampoDeViaje, CelularCustodia, CodigoCelular, EspacioFotos, NumeracionGuias, PinCreado, PinCustodio } from '../types/custodiaCampo';

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
  descargarBlob(blob, `Guia-${nombreSeguro(numeroGuia, '-')}.pdf`);
};

// ---- Fase 1 «Custodias en campo»: configuración, rutas, campos de la guía, clientes y envío ----

export const getConfigCustodias = () => api.get('/custodias/config').then(r => r.data as ConfigCustodias);
export const updateConfigCustodias = (data: Partial<Pick<ConfigCustodias, 'firmaMomento' | 'firmaObligatoria' | 'correoCopias' | 'correoAsunto' | 'correoTexto' | 'telefonoOperaciones' | 'fotosPedidas'>>) =>
  api.put('/custodias/config', data).then(r => r.data as ConfigCustodias);
export const setFirmaCliente = (salesClientId: number, firmaMomento: MomentoFirma) =>
  api.put(`/custodias/config/firmas-cliente/${salesClientId}`, { firmaMomento }).then(r => r.data);
export const quitarFirmaCliente = (salesClientId: number) =>
  api.delete(`/custodias/config/firmas-cliente/${salesClientId}`).then(r => r.data);

export interface RutaForm {
  nombre: string;
  origen: string;
  destino: string;
  puntos: { nombre: string; minutosDesdeAnterior: number }[];
}
export const getRutasCustodia = (incluirInactivas = false) =>
  api.get('/custodias/rutas', { params: incluirInactivas ? { incluirInactivas: true } : undefined }).then(r => r.data as RutaCustodia[]);
export const crearRutaCustodia = (data: RutaForm) => api.post('/custodias/rutas', data).then(r => r.data);
export const editarRutaCustodia = (id: number, data: RutaForm) => api.put(`/custodias/rutas/${id}`, data).then(r => r.data);
export const activarRutaCustodia = (id: number, activo: boolean) => api.patch(`/custodias/rutas/${id}/activo`, { activo }).then(r => r.data);

export const getCamposCustodia = (incluirInactivos = false) =>
  api.get('/custodias/campos', { params: incluirInactivos ? { incluirInactivos: true } : undefined }).then(r => r.data as CampoGuia[]);
export const crearCampoCustodia = (data: CampoGuiaForm) => api.post('/custodias/campos', data).then(r => r.data);
export const editarCampoCustodia = (id: number, data: CampoGuiaForm) => api.put(`/custodias/campos/${id}`, data).then(r => r.data);
export const activarCampoCustodia = (id: number, activo: boolean) => api.patch(`/custodias/campos/${id}/activo`, { activo }).then(r => r.data);
export const ordenarCamposCustodia = (ids: number[]) => api.put('/custodias/campos/orden', { ids }).then(r => r.data);

export const buscarClientesCustodia = (buscar: string) =>
  api.get('/custodias/clientes', { params: { buscar } }).then(r => r.data as ClienteDirectorio[]);
export const crearClienteCustodia = (data: { name: string; ruc?: string; email?: string; phone?: string }) =>
  api.post('/custodias/clientes', data).then(r => r.data as ClienteDirectorio);

export const getDatosEnvio = (id: number) => api.get(`/custodias/${id}/envio`).then(r => r.data as DatosEnvio);
export const enviarGuiaCliente = (id: number, data: { para: string[]; copia: string[]; asunto: string; texto: string }) =>
  api.post(`/custodias/${id}/enviar`, data).then(r => r.data as EnvioGuia);

// ---- Fase 2 «Custodias en campo»: celulares, PIN, recorrido, fotos, firmas y espacio ----

export const crearCodigoCelular = (nombre: string) =>
  api.post('/custodias/dispositivos/codigo', { nombre }).then(r => r.data as CodigoCelular);
export const getCelularesCustodia = () => api.get('/custodias/dispositivos').then(r => r.data as CelularCustodia[]);
export const desvincularCelularCustodia = (id: number) => api.post(`/custodias/dispositivos/${id}/desvincular`).then(r => r.data);
/** Código de 10 minutos para volver a vincular el MISMO celular (conserva su nombre y sus viajes). */
export const vincularDeNuevoCelular = (id: number) =>
  api.post(`/custodias/dispositivos/${id}/vincular-de-nuevo`).then(r => r.data as CodigoCelular);
/** Oculta de la lista un celular ya desvinculado (los viajes que lo usaron siguen mostrando su nombre). */
export const quitarCelularCustodia = (id: number) => api.post(`/custodias/dispositivos/${id}/quitar`).then(r => r.data);
export const renombrarCelularCustodia = (id: number, nombre: string) =>
  api.patch(`/custodias/dispositivos/${id}`, { nombre }).then(r => r.data as { ok: boolean; nombre: string });

// Numeración automática de las guías (GEM-0001): el prefijo se cambia en Configuración → Campos de la guía.
export const getNumeracionGuias = () => api.get('/custodias/numeracion').then(r => r.data as NumeracionGuias);
export const guardarNumeracionGuias = (prefijo: string) =>
  api.put('/custodias/numeracion', { prefijo }).then(r => r.data as NumeracionGuias);

export const getPinesCustodia = () => api.get('/custodias/pines').then(r => r.data as PinCustodio[]);
export const darPinCustodio = (data: { cedula: string; nombre: string }) =>
  api.post('/custodias/pines', data).then(r => r.data as PinCreado);
export const quitarPinCustodio = (cedula: string) => api.delete(`/custodias/pines/${encodeURIComponent(cedula)}`).then(r => r.data);

export const getCampoDeViaje = (id: number) => api.get(`/custodias/${id}/campo`).then(r => r.data as CampoDeViaje);
// Las imágenes se piden con el token de sesión (un <img src> directo daría 401): se bajan como Blob.
export const getFotoCustodiaBlob = (fotoId: number, miniatura: boolean) =>
  api.get(`/custodias/fotos/${fotoId}`, { params: miniatura ? { miniatura: 1 } : undefined, responseType: 'blob' }).then(r => r.data as Blob);
export const getFirmaCustodiaBlob = (firmaId: number) =>
  api.get(`/custodias/firmas/${firmaId}/imagen`, { responseType: 'blob' }).then(r => r.data as Blob);

export const getEspacioFotos = () => api.get('/custodias/espacio').then(r => r.data as EspacioFotos);
export const limpiarEspacioFotos = (antesDe: string) =>
  api.post('/custodias/espacio/limpiar', { antesDe }).then(r => r.data as { fotos: number; bytes: number });
