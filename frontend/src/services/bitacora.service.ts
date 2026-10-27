import axios from 'axios';
import { api } from './auth.service';

export interface FilaHoja {
  desde: string;
  hasta: string;
  /** APP (lo que se hizo en app.gemeseg) o GOOGLE (inicio de sesión y Drive). */
  fuente: string;
  modulo: string;
  moduloEtiqueta: string;
  texto: string;
  veces: number;
}

export interface HuecoHoja {
  desde: string;
  hasta: string;
  minutos: number;
}

export interface HojaDia {
  fecha: string;
  primera: string | null;
  ultima: string | null;
  totalEventos: number;
  huecoMinimoMinutos: number;
  huecos: HuecoHoja[];
  filas: FilaHoja[];
}

export interface EstadoBitacora {
  /** La empresa tiene la bitácora encendida. */
  empresaActiva: boolean;
  /** La persona tiene o tuvo la hoja activada (decide si ve «Mi hoja del día»). */
  registrada: boolean;
  /** Hoy se le está registrando. */
  activa: boolean;
  desde: string | null;
  /** Puede activar y desactivar hojas (administradores y gerentes). */
  puedeAdministrar: boolean;
}

export interface ActivacionPersona {
  userId: number;
  nombre: string;
  cargo: string | null;
  email: string;
  activa: boolean;
  desde: string | null;
  cambiadaEn: string | null;
  cambiadaPor: string | null;
}

export interface ResumenPersona {
  userId: number;
  nombre: string;
  cargo: string | null;
  /** Hoy se le está registrando; false = solo se muestra su historial. */
  activa: boolean;
  primera: string | null;
  ultima: string | null;
  totalEventos: number;
  accionesApp: number;
  eventosGoogle: number;
  huecosLargos: number;
  mayorHuecoMinutos: number;
}

export interface ResultadoSincronizacion {
  ok: boolean;
  mensaje: string;
  personas: number;
  leidos: number;
  guardados: number;
}

export interface Metricas {
  dias: number;
  desde: string;
  hasta: string;
  personasActivas: number;
  resumen: {
    eventos: number;
    promedioPersonasConActividad: number;
    horaMediaInicio: string | null;
    horaMediaFin: string | null;
    diasConActividad: number;
  };
  porDia: { fecha: string; personasConActividad: number; eventosApp: number; eventosGoogle: number }[];
  /** Eventos por hora del día de Ecuador (24 valores). */
  porHora: number[];
  porModulo: { modulo: string; etiqueta: string; eventos: number }[];
}

export const getMetricas = (dias: number): Promise<Metricas> =>
  api.get('/bitacora/metricas', { params: { dias } }).then((r) => r.data);

export const getBitacoraEstado = (): Promise<EstadoBitacora> =>
  api.get('/bitacora/estado').then((r) => r.data);

export const getMiHoja = (
  fecha: string,
): Promise<EstadoBitacora & { fecha: string; hoja: HojaDia | null }> =>
  api.get('/bitacora/mi-hoja', { params: { fecha } }).then((r) => r.data);

export const getActivaciones = (): Promise<ActivacionPersona[]> =>
  api.get('/bitacora/activaciones').then((r) => r.data);

export const cambiarActivacion = (
  userId: number,
  activa: boolean,
): Promise<ActivacionPersona> =>
  api.put(`/bitacora/activaciones/${userId}`, { activa }).then((r) => r.data);

export const getBitacoraEquipo = (
  fecha: string,
): Promise<{ fecha: string; personas: ResumenPersona[] }> =>
  api.get('/bitacora/equipo', { params: { fecha } }).then((r) => r.data);

export const getBitacoraPersona = (
  userId: number,
  fecha: string,
): Promise<{
  persona: { id: number; nombre: string; cargo: string | null; activa: boolean };
  hoja: HojaDia;
}> => api.get(`/bitacora/equipo/${userId}`, { params: { fecha } }).then((r) => r.data);

export interface EstadoGoogle {
  /** Hay cuenta de administrador y credencial en el servidor. */
  configurado: boolean;
  falta: 'administrador' | 'credenciales' | null;
  /** Personas con la hoja activada, que son a las que se les lee Google. */
  personasActivas: number;
  /** Último evento de Google que quedó guardado (no es la hora de la última lectura). */
  ultimoEvento: string | null;
}

export const getEstadoGoogle = (): Promise<EstadoGoogle> =>
  api.get('/bitacora/google/estado').then((r) => r.data);

export const sincronizarGoogleAhora = (): Promise<ResultadoSincronizacion> =>
  api.post('/bitacora/google/sincronizar').then((r) => r.data);

/**
 * Mensaje corto para mostrar a la persona. Solo se muestran los textos que el
 * propio servidor escribe para 400 (fecha inválida, entrar con usuario de
 * empresa); cualquier otro fallo se resume sin texto técnico.
 */
export function mensajeErrorBitacora(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const estado = err.response?.status;
    const mensaje = err.response?.data?.message;
    // El guard de secciones escribe el nombre interno de la sección en su 403: no se muestra.
    if (estado === 403 && (typeof mensaje !== 'string' || /BITACORA/.test(mensaje))) {
      return 'No tienes acceso a esta pantalla.';
    }
    // Los demás 400, 403 y 404 de la bitácora llevan textos propios del servidor, en español y sin datos técnicos.
    if ([400, 403, 404].includes(estado ?? 0) && typeof mensaje === 'string') return mensaje;
  }
  return 'No se pudo cargar la bitácora. Inténtalo de nuevo en un momento.';
}
