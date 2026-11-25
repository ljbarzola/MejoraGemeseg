import axios from 'axios';
import type {
  CambioGuia, EstadoCelular, GuiaFotosPublica, ResultadoEvento, SesionCampo, Ubicacion, ViajeCampo,
} from '../types/custodiaCampo';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Instancia propia, SIN el interceptor de la sesión de la app: la pantalla de campo la usa el custodio en su
 * celular con el token del CELULAR (`cd_…`) y el de su sesión (`cs_…`), nunca con un token de usuario.
 * Sin `Content-Type` fijo: axios pone JSON para objetos y deja al navegador poner el límite de los archivos.
 */
const campoApi = axios.create({ baseURL: API_URL, timeout: 30_000 });
const publicApi = axios.create({ baseURL: API_URL, timeout: 30_000 });

// ---- Lo que se recuerda en el celular (localStorage envuelto: puede no existir o fallar) ----

const K_CELULAR = 'campo:celular';
const K_SESION = 'campo:sesion';
const K_SNAPSHOT = 'campo:snapshot';

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch { /* sin almacenamiento: la pantalla pedirá el código de nuevo */ }
}

export const tokenCelular = () => leer(K_CELULAR);
export const guardarTokenCelular = (t: string | null) => escribir(K_CELULAR, t);

export interface SesionGuardada {
  token: string;
  custodiaId: number;
  nombre: string;
  rol: string;
}
export function sesionGuardada(): SesionGuardada | null {
  const bruto = leer(K_SESION);
  if (!bruto) return null;
  try {
    const s = JSON.parse(bruto);
    return s && typeof s.token === 'string' && typeof s.custodiaId === 'number' ? (s as SesionGuardada) : null;
  } catch { return null; }
}
export const guardarSesion = (s: SesionGuardada | null) => escribir(K_SESION, s ? JSON.stringify(s) : null);

/** Última foto del estado y del viaje, para abrir la pantalla aunque no haya señal. */
export interface Snapshot { estado: EstadoCelular; viaje: ViajeCampo | null; guardadoEn: number }
export function leerSnapshot(): Snapshot | null {
  const bruto = leer(K_SNAPSHOT);
  if (!bruto) return null;
  try { return JSON.parse(bruto) as Snapshot; } catch { return null; }
}
export const guardarSnapshot = (s: Snapshot | null) => escribir(K_SNAPSHOT, s ? JSON.stringify(s) : null);

function cabeceras(conSesion: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  const t = tokenCelular();
  if (t) h.Authorization = `Bearer ${t}`;
  if (conSesion) {
    const s = sesionGuardada();
    if (s) h['X-Sesion-Custodio'] = s.token;
  }
  return h;
}

// ---- Errores: qué hacer con cada uno ----

export type ClaseError = 'sin_red' | 'reintentar' | 'no_autorizado' | 'rechazado';

export interface ErrorCampo {
  clase: ClaseError;
  mensaje: string;
  status?: number;
}

/** El servidor manda mensajes cortos en español en los 4xx; en cualquier otro caso se usa uno general. */
export function mensajeServidor(err: any, general: string): string {
  const m = err?.response?.data?.message;
  if (typeof m === 'string' && m.trim() && m.length <= 240) return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m.join(' ').slice(0, 240);
  return general;
}

export function clasificarError(err: any, general = 'No se pudo completar. Inténtalo de nuevo.'): ErrorCampo {
  const status: number | undefined = err?.response?.status;
  if (!err?.response) return { clase: 'sin_red', mensaje: 'Sin señal. Se enviará cuando haya conexión.' };
  if (status === 401) return { clase: 'no_autorizado', mensaje: mensajeServidor(err, 'La sesión ya no es válida.'), status };
  if (status === 408 || status === 429 || (status && status >= 500)) {
    return { clase: 'reintentar', mensaje: 'El servidor no responde ahora. Se intentará de nuevo.', status };
  }
  return { clase: 'rechazado', mensaje: mensajeServidor(err, general), status };
}

// ---- API de campo ----

export const vincularCelular = (codigo: string, nombreEquipo?: string) =>
  campoApi.post('/custodias/campo/vincular', { codigo, nombreEquipo }).then((r) => r.data as { token: string; nombre: string });

export const getEstadoCampo = () =>
  campoApi.get('/custodias/campo/estado', { headers: cabeceras(true) }).then((r) => r.data as EstadoCelular);

export const abrirSesionCampo = (cedula: string, pin: string) =>
  campoApi.post('/custodias/campo/sesion', { cedula, pin }, { headers: cabeceras(false) }).then((r) => r.data as SesionCampo);

export const cerrarSesionCampo = () =>
  campoApi.post('/custodias/campo/sesion/cerrar', {}, { headers: cabeceras(true) }).then((r) => r.data);

export const getViajeCampo = () =>
  campoApi.get('/custodias/campo/viaje', { headers: cabeceras(true) }).then((r) => r.data as ViajeCampo);

export interface EventoEnvio {
  clientUuid: string;
  tipo: 'SALIDA' | 'PUNTO' | 'LLEGADA' | 'NOVEDAD' | 'OBSERVACION';
  ocurridoEn: string;
  puntoId?: number;
  texto?: string;
  novedadTipo?: string;
  lat?: number;
  lng?: number;
  precisionM?: number;
}

export const enviarEventos = (items: EventoEnvio[]) =>
  campoApi.post('/custodias/campo/eventos', { items }, { headers: cabeceras(true) }).then((r) => (r.data?.resultados ?? []) as ResultadoEvento[]);

export interface DatosFoto {
  clientUuid: string;
  momento: string;
  puntoId?: number;
  eventoUuid?: string;
  etiqueta?: string;
  comentario?: string;
  tomadaEn: string;
  /** Cámara o galería; sin dato el servidor entiende que fue con la cámara. */
  origen?: 'CAMARA' | 'GALERIA';
  lat?: number;
  lng?: number;
  precisionM?: number;
}

export function enviarFoto(foto: Blob, miniatura: Blob, datos: DatosFoto) {
  const f = new FormData();
  f.append('foto', foto, 'foto.jpg');
  f.append('miniatura', miniatura, 'miniatura.jpg');
  f.append('datos', JSON.stringify(datos));
  // Las fotos suben por datos móviles lentos: se le da más tiempo que al resto.
  return campoApi.post('/custodias/campo/fotos', f, { headers: cabeceras(true), timeout: 90_000 }).then((r) => r.data);
}

export interface DatosFirma {
  clientUuid: string;
  momento: 'SALIDA' | 'LLEGADA';
  nombre: string;
  cedula?: string;
  imagenPng: string;
  firmadaEn: string;
  lat?: number;
  lng?: number;
}

export const enviarFirma = (datos: DatosFirma) =>
  campoApi.post('/custodias/campo/firmas', datos, { headers: cabeceras(true) }).then((r) => r.data);

export const enviarCambiosGuia = (cambios: CambioGuia[]) =>
  campoApi.patch('/custodias/campo/guia', { cambios }, { headers: cabeceras(true) }).then((r) => r.data);

// ---- Ubicación: UNA vez por evento, foto o firma; si falla o tarda, se sigue sin ella ----

export function tomarUbicacion(): Promise<Ubicacion | null> {
  return new Promise((resolver) => {
    if (!('geolocation' in navigator)) { resolver(null); return; }
    let listo = false;
    const fin = (u: Ubicacion | null) => { if (!listo) { listo = true; resolver(u); } };
    // El temporizador propio cubre navegadores que no respetan `timeout` cuando el permiso está sin contestar.
    const tope = window.setTimeout(() => fin(null), 11_000);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => { window.clearTimeout(tope); fin({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy }); },
        () => { window.clearTimeout(tope); fin(null); },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
      );
    } catch {
      window.clearTimeout(tope);
      fin(null);
    }
  });
}

// ---- Enlace público de fotos (/guia-fotos/:token) ----

export const getGuiaFotosPublica = (token: string) =>
  publicApi.get(`/public/custodias/fotos/${encodeURIComponent(token)}`).then((r) => r.data as GuiaFotosPublica);

/** Dirección de la foto grande del enlace público (se abre con <img>, no necesita sesión). */
export const urlFotoPublica = (token: string, fotoId: number) =>
  `${API_URL}/public/custodias/fotos/${encodeURIComponent(token)}/${fotoId}`;
