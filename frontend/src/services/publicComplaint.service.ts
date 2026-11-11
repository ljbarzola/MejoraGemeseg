import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Instancia propia, SIN el interceptor que adjunta el token: la usa gente sin cuenta
// (personal en inducción) y un token viejo de otra sesión solo la confundiría.
const publicApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface PublicComplaintForm {
  tipos: string[];
  sedes: string[];
}

export interface PublicComplaintPayload {
  tipo: string;
  sede: string;
  fechaInduccion: string;
  description: string;
  anonima: boolean;
  aceptaPrivacidad: boolean;
  personasInvolucradas?: string;
  contactoNombre?: string;
  contactoEmail?: string;
  contactoTelefono?: string;
  sitioWeb?: string;
}

export const getPublicComplaintForm = (): Promise<PublicComplaintForm> =>
  publicApi.get('/public/quejas/formulario').then((r) => r.data);

export const submitPublicComplaint = (data: PublicComplaintPayload) =>
  publicApi.post('/public/quejas', data).then((r) => r.data);

/** Dirección que lleva el código QR de la inducción. */
export const URL_QUEJAS_PUBLICAS = 'https://quejas.gemeseg.com';

/** En quejas.gemeseg.com la app solo muestra el formulario. */
export const esDominioDeQuejas = () =>
  typeof window !== 'undefined' && window.location.hostname.startsWith('quejas.');
