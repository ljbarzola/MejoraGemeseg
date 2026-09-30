import axios from 'axios';
import type { AuthResponse } from '../types/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sesión vencida o inválida (el JWT dura 7 días). Antes nadie atendía el 401:
// la app seguía "abierta" con el token viejo guardado, todas las consultas
// fallaban en silencio y el menú caía a solo Inicio/Buzón/Encuestas/Proyectos
// — ni Ctrl+F5 lo arreglaba, porque el token sigue en localStorage (reportado
// por RRHH 2026-09-30; en ventana privada funcionaba porque no hay token).
// Ahora se cierra la sesión y se manda a iniciar sesión con un aviso.
// Las rutas /auth/ quedan fuera: ahí un 401 es "contraseña incorrecta".
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/') && getToken()) {
      expireSession();
    }
    return Promise.reject(error);
  },
);

export const SESSION_EXPIRED_FLAG = 'session_expired';

function expireSession() {
  removeToken();
  try {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1');
  } catch {
    /* sin sessionStorage: se redirige igual, solo sin el aviso */
  }
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

/** exp del JWT (segundos) ya pasado. Un token que no se puede leer se trata como vencido. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/register', data);
  return res.data;
}

export async function login(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', data);
  return res.data;
}

/**
 * Paso 1: pide un código de recuperación al correo.
 *
 * Responde lo mismo exista o no la cuenta — a propósito: si dijera "ese correo
 * no está registrado" serviría para averiguar qué cuentas existen.
 */
export async function requestPasswordReset(data: {
  email: string;
}): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/forgot-password/request', data);
  return res.data;
}

/** Paso 2: canjea el código por la contraseña nueva. */
export async function confirmPasswordReset(data: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/forgot-password/confirm', data);
  return res.data;
}

export function saveAuth(auth: AuthResponse) {
  localStorage.setItem('token', auth.token);
  localStorage.setItem('user', JSON.stringify(auth.user));
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function getUser(): { id: number; email: string; fullName: string; position?: string | null; role: string; companyId: number | null } | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function removeToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  const cacheReclutamiento: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('reclutamiento_')) cacheReclutamiento.push(key);
  }
  cacheReclutamiento.forEach((key) => localStorage.removeItem(key));
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    removeToken();
    try {
      sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1');
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

export { api };
