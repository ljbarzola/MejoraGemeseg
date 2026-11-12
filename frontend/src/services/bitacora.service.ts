import axios from 'axios';
import { api } from './auth.service';

export interface FilaHoja {
  desde: string;
  hasta: string;
  /** APP (lo que se hizo en app.gemeseg), GOOGLE (inicio de sesión y Drive) o EXTENSION (sitios web). */
  fuente: string;
  modulo: string;
  moduloEtiqueta: string;
  texto: string;
  veces: number;
  /** Solo sitios web: minutos sumados en esa fila. */
  minutos?: number;
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
  /** Minutos en sitios web que reportó la extensión del navegador. */
  minutosWeb: number;
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
  porDia: {
    fecha: string;
    personasConActividad: number;
    eventosApp: number;
    eventosGoogle: number;
    eventosWeb: number;
  }[];
  /** Eventos por hora del día de Ecuador (24 valores). */
  porHora: number[];
  porModulo: { modulo: string; etiqueta: string; eventos: number }[];
}

export const getMetricas = (dias: number): Promise<Metricas> =>
  api.get('/bitacora/metricas', { params: { dias } }).then((r) => r.data);

export const getBitacoraEstado = (): Promise<EstadoBitacora> =>
  api.get('/bitacora/estado').then((r) => r.data);

/** Lo que la persona anota de su día cuando algo no se registró solo («Escrito por la persona»). */
export interface NotaDia {
  id: number;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  /** REUNION | VISITA | SIN_COMPUTADOR | OTRO */
  tipo: string;
  texto: string;
  creadaEn: string;
  editadaEn: string | null;
}

export interface ResumenDia {
  fecha: string;
  userId: number;
  texto: string;
  puntos: string[];
  /** true = redactado por la IA con las cifras; false = texto calculado con plantilla. */
  conIA: boolean;
  generadoPor: string | null;
  generadoEn: string;
  veces: number;
  /** Hubo actividad o anotaciones nuevas después de generarlo. */
  desactualizado: boolean;
  reutilizado?: boolean;
}

export const getMiHoja = (
  fecha: string,
): Promise<EstadoBitacora & { fecha: string; hoja: HojaDia | null; notas: NotaDia[]; resumen: ResumenDia | null }> =>
  api.get('/bitacora/mi-hoja', { params: { fecha } }).then((r) => r.data);

export const crearNotaDia = (datos: {
  fecha: string;
  desde?: string;
  hasta?: string;
  tipo: string;
  texto: string;
}): Promise<NotaDia> => api.post('/bitacora/notas', datos).then((r) => r.data);

export const editarNotaDia = (
  id: number,
  datos: { desde?: string; hasta?: string; tipo?: string; texto?: string },
): Promise<NotaDia> => api.put(`/bitacora/notas/${id}`, datos).then((r) => r.data);

export const eliminarNotaDia = (id: number): Promise<{ ok: true }> =>
  api.delete(`/bitacora/notas/${id}`).then((r) => r.data);

/** Genera (o reutiliza) el resumen de un día. Sin `userId` es el propio; con otra persona exige permiso de ver el equipo. */
export const generarResumenDia = (fecha: string, userId?: number): Promise<ResumenDia> =>
  api.post('/bitacora/resumen', { fecha, userId }).then((r) => r.data);

export interface SitiosSensibles {
  /** Vienen con la aplicación y no se pueden quitar. */
  porDefecto: string[];
  /** Los que agregó la empresa. */
  propios: string[];
}

export const getSitiosSensibles = (): Promise<SitiosSensibles> =>
  api.get('/bitacora/sitios-sensibles').then((r) => r.data);

export const guardarSitiosSensibles = (dominios: string[]): Promise<SitiosSensibles> =>
  api.put('/bitacora/sitios-sensibles', { dominios }).then((r) => r.data);

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
  notas: NotaDia[];
  resumen: ResumenDia | null;
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

/** Días y horas en los que la extensión del navegador registra (hora de Ecuador). */
export interface HorarioBitacora {
  /** Si la empresa ya guardó un horario; sin él la extensión no registra nada. */
  configurado: boolean;
  /** 1 = lunes ... 7 = domingo. */
  dias: number[];
  inicio: string;
  fin: string;
  /** Menos de estos minutos de tiempo extra no suman. */
  toleranciaMinutos: number;
  /** Minutos sin actividad tras los que se cierra solo el tiempo extra. */
  inactividadMinutos: number;
}

export const getHorarioBitacora = (): Promise<HorarioBitacora> =>
  api.get('/bitacora/horario').then((r) => r.data);

export const guardarHorarioBitacora = (
  horario: Pick<HorarioBitacora, 'dias' | 'inicio' | 'fin' | 'toleranciaMinutos' | 'inactividadMinutos'>,
): Promise<HorarioBitacora> => api.put('/bitacora/horario', horario).then((r) => r.data);

// ───────────────────────── Bolsa de horas: tiempo extra y horas que se deben ─────────────────────────

export interface ExtraVista {
  id: number;
  inicio: string;
  /** null = sigue abierto. */
  fin: string | null;
  /** MANUAL | INACTIVIDAD | HORARIO | LIMITE */
  cierre: string | null;
  /** Minutos con actividad real fuera del horario. */
  minutos: number;
  /** Lo que cuenta tras la tolerancia. */
  minutosContados: number;
  /** PENDIENTE | APROBADA | RECHAZADA | SIN_TIEMPO */
  estado: string;
  notaJefe: string | null;
  resueltoEn: string | null;
}

export interface DeudaVista {
  id: number;
  fecha: string;
  minutos: number;
  motivo: string;
  creadaPor: string | null;
  creadaEn: string;
}

export interface SaldoHoras {
  abonadoMinutos: number;
  deudaMinutos: number;
  /** Positivo = a favor de la persona; negativo = debe horas. */
  saldoMinutos: number;
  pendienteMinutos: number;
}

export interface EstadoHoras {
  horarioConfigurado: boolean;
  reglas: { toleranciaMinutos: number; inactividadMinutos: number };
  abierta: ExtraVista | null;
  saldo: SaldoHoras;
  extras: ExtraVista[];
  deudas: DeudaVista[];
}

export interface ResumenHorasEquipo {
  personas: (SaldoHoras & { userId: number; nombre: string; cargo: string | null })[];
  pendientes: (ExtraVista & { userId: number; nombre: string })[];
  recientes: (ExtraVista & { userId: number; nombre: string })[];
  deudas: (DeudaVista & { userId: number; nombre: string })[];
}

export const getMiEstadoHoras = (): Promise<EstadoHoras> =>
  api.get('/bitacora/horas/mi-estado').then((r) => r.data);

export const iniciarTiempoExtra = (): Promise<EstadoHoras> =>
  api.post('/bitacora/horas/iniciar').then((r) => r.data);

export const terminarTiempoExtra = (): Promise<EstadoHoras> =>
  api.post('/bitacora/horas/terminar').then((r) => r.data);

export const anotarHorasDebidas = (datos: {
  userId?: number;
  minutos: number;
  motivo: string;
  fecha?: string;
}): Promise<EstadoHoras> => api.post('/bitacora/horas/deudas', datos).then((r) => r.data);

export const anularHorasDebidas = (id: number): Promise<{ ok: true }> =>
  api.delete(`/bitacora/horas/deudas/${id}`).then((r) => r.data);

export const getHorasEquipo = (): Promise<ResumenHorasEquipo> =>
  api.get('/bitacora/horas/equipo').then((r) => r.data);

export const resolverTiempoExtra = (id: number, aprobar: boolean, nota?: string): Promise<{ ok: true }> =>
  api.put(`/bitacora/horas/extras/${id}`, { aprobar, nota }).then((r) => r.data);

export interface EstadoExtension {
  vinculada: boolean;
  dispositivos: { id: number; nombreEquipo: string | null; creadoEn: string; ultimoUso: string | null }[];
}

export const getEstadoExtension = (): Promise<EstadoExtension> =>
  api.get('/bitacora/extension').then((r) => r.data);

export const crearCodigoExtension = (): Promise<{ codigo: string; expiraEn: string }> =>
  api.post('/bitacora/extension/codigo').then((r) => r.data);

export const desvincularExtensiones = (): Promise<EstadoExtension> =>
  api.delete('/bitacora/extension').then((r) => r.data);

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
