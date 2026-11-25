// Reglas puras de la página de campo (2026-11-24, Fase 2): tokens, PIN, cabeceras y validación de lo que manda el
// celular. Sin base de datos, para poder probarlas. El celular manda lo que quiera: aquí se revisa y se recorta.

import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';
import { esCedulaSintetica } from '../personal/utils/postulacion-validacion.util';

export const PREFIJO_TOKEN_CELULAR = 'cd_';
export const PREFIJO_TOKEN_SESION = 'cs_';
export const MAX_ITEMS_EVENTOS = 50;
export const MAX_FOTO_BYTES = 1.5 * 1024 * 1024;
export const MAX_MINIATURA_BYTES = 200 * 1024;
export const MAX_FIRMA_BYTES = 300 * 1024;

// OBSERVACION: algo de los datos del viaje que el custodio avisa que está mal o distinto (no cambia el estado).
export const TIPOS_EVENTO = ['SALIDA', 'PUNTO', 'LLEGADA', 'NOVEDAD', 'OBSERVACION'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const TIPOS_NOVEDAD = ['TRAFICO', 'RETEN', 'DESVIO', 'AVERIA', 'ACCIDENTE', 'OTRO'] as const;
export const MOMENTOS_FOTO = ['SALIDA', 'PUNTO', 'LLEGADA', 'NOVEDAD', 'LIBRE'] as const;
/** De dónde salió la foto: tomada con la cámara en ese momento o elegida de la galería del celular. */
export const ORIGENES_FOTO = ['CAMARA', 'GALERIA'] as const;
export type OrigenFoto = (typeof ORIGENES_FOTO)[number];
export const MOMENTOS_FIRMA_CAMPO = ['SALIDA', 'LLEGADA'] as const;
export const ROLES_VIAJE = ['chofer', 'custodio1', 'custodio2', 'custodio3', 'custodio4'] as const;
export type RolViaje = (typeof ROLES_VIAJE)[number];

export const esRolViaje = (v: unknown): v is RolViaje =>
  typeof v === 'string' && (ROLES_VIAJE as readonly string[]).includes(v);

export const ETIQUETA_ROL: Record<RolViaje, string> = {
  chofer: 'Chofer custodio',
  custodio1: 'Custodio 1',
  custodio2: 'Custodio 2',
  custodio3: 'Custodio 3',
  custodio4: 'Custodio 4',
};

// ───────────────────────────── Tokens y hashes ─────────────────────────────

export const hashearToken = (valor: string): string => createHash('sha256').update(valor).digest('hex');

export const generarTokenCelular = (): string => `${PREFIJO_TOKEN_CELULAR}${randomBytes(32).toString('base64url')}`;
export const generarTokenSesion = (): string => `${PREFIJO_TOKEN_SESION}${randomBytes(32).toString('base64url')}`;
/** Token del enlace público de fotos (sin prefijo: va en la URL). */
export const generarTokenEnlace = (): string => randomBytes(32).toString('base64url');

const TOKEN_ENLACE_RE = /^[A-Za-z0-9_-]{30,80}$/;
export const esTokenEnlace = (v: unknown): v is string => typeof v === 'string' && TOKEN_ENLACE_RE.test(v);

/** Quita el «Bearer » de la cabecera Authorization y exige el prefijo del token del celular. */
export function tokenCelularDeCabecera(cabecera: unknown): string | null {
  if (typeof cabecera !== 'string') return null;
  const m = /^Bearer\s+(cd_[A-Za-z0-9_-]{20,100})$/.exec(cabecera.trim());
  return m ? m[1] : null;
}

/** El token de sesión llega en `X-Sesion-Custodio`. */
export function tokenSesionDeCabecera(cabecera: unknown): string | null {
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  if (typeof valor !== 'string') return null;
  const m = /^(cs_[A-Za-z0-9_-]{20,100})$/.exec(valor.trim());
  return m ? m[1] : null;
}

// ───────────────────────────── PIN ─────────────────────────────

const SCRYPT_LARGO = 32;

const derivar = (pin: string, sal: Buffer): Promise<Buffer> =>
  new Promise((resolver, rechazar) => {
    scrypt(pin, sal, SCRYPT_LARGO, (err, clave) => (err ? rechazar(err) : resolver(clave)));
  });

/** PIN de 4 dígitos, con ceros a la izquierda si toca. */
export const generarPin = (): string => String(randomInt(0, 10000)).padStart(4, '0');

export const esPinValido = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v);

/** `sal:hash` en hexadecimal (scrypt con sal aleatoria). */
export async function hashearPin(pin: string): Promise<string> {
  const sal = randomBytes(16);
  const clave = await derivar(pin, sal);
  return `${sal.toString('hex')}:${clave.toString('hex')}`;
}

/** Comparación a tiempo constante. Un hash mal formado nunca coincide. */
export async function verificarPin(pin: string, guardado: string): Promise<boolean> {
  const [salHex, hashHex] = (guardado ?? '').split(':');
  if (!salHex || !hashHex || !/^[0-9a-f]+$/i.test(salHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== SCRYPT_LARGO) return false;
  const obtenido = await derivar(pin, Buffer.from(salHex, 'hex'));
  return timingSafeEqual(esperado, obtenido);
}

/** Un hash falso para gastar el mismo tiempo cuando la cédula no existe (no revela si tiene PIN). */
export const HASH_PIN_FALSO = `${'00'.repeat(16)}:${'00'.repeat(SCRYPT_LARGO)}`;

// ───────────────────────────── Cédula ─────────────────────────────

/** Mayúsculas y sin espacios: así se guardan los PIN y así se comparan con las cédulas del viaje. */
export const normalizarCedula = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : '';

/** Cédula real (10 dígitos o pasaporte de 5 a 20 caracteres); nunca una clave interna ID-/TEMP-/SC-. */
export function esCedulaConPin(v: unknown): boolean {
  const c = normalizarCedula(v);
  return !!c && !esCedulaSintetica(c) && /^[A-Z0-9-]{5,20}$/.test(c);
}

// ───────────────────────────── Lo que manda el celular ─────────────────────────────

export const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export const textoOpcional = (v: unknown, max: number): string | null => texto(v, max) || null;

const UUID_RE = /^[A-Za-z0-9-]{8,64}$/;
export const esClientUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Coordenadas: solo valores reales del planeta; cualquier otra cosa se descarta (nunca bloquea). */
export function coordenada(v: unknown, limite: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limite) return null;
  return Math.round(v * 1e6) / 1e6;
}
export const latitud = (v: unknown) => coordenada(v, 90);
export const longitud = (v: unknown) => coordenada(v, 180);
export function precision(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v) : null;
}

/** Fecha enviada por el celular; null si no es una fecha válida. */
export function fechaDe(v: unknown): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MARGEN_FUTURO_MS = 5 * 60_000;
const DIA_MS = 24 * 3600_000;

/**
 * La hora que vale es la del momento en el celular: no más de 5 minutos en el futuro ni antes de que el viaje
 * existiera (menos un día). Devuelve el mensaje de error o null si está bien.
 */
export function errorDeHora(hora: Date, creadoEn: Date, ahora = new Date()): string | null {
  if (hora.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) {
    return 'La hora no puede estar en el futuro. Revisa el reloj del celular.';
  }
  if (hora.getTime() < creadoEn.getTime() - DIA_MS) {
    return 'La hora es anterior a la creación del viaje. Revisa el reloj del celular.';
  }
  return null;
}

/** Los archivos se reconocen por su cabecera real, no por lo que declara el celular. */
export const esJpeg = (b: Buffer): boolean => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
export const esPng = (b: Buffer): boolean =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Base64 estricto (sin prefijo data:), con tamaño máximo ya decodificado. */
export function decodificarBase64(v: unknown, maxBytes: number): Buffer | null {
  if (typeof v !== 'string' || !v || v.length > Math.ceil((maxBytes * 4) / 3) + 8) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  const b = Buffer.from(v, 'base64');
  return b.length > 0 && b.length <= maxBytes ? b : null;
}

export const claveFoto = (companyId: number, custodiaId: number, uuid: string, miniatura: boolean) =>
  `custodias/${companyId}/${custodiaId}/fotos/${uuid}${miniatura ? '-min' : ''}.jpg`;
export const claveFirma = (companyId: number, custodiaId: number, uuid: string) =>
  `custodias/${companyId}/${custodiaId}/firmas/${uuid}.png`;

/** Fecha «YYYY-MM-DD» → inicio de ese día en Ecuador (UTC-5) como instante UTC. null si no es una fecha real. */
export function inicioDiaEcuador(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d, 5, 0, 0));
  if (Number.isNaN(fecha.getTime()) || fecha.getUTCDate() !== d || fecha.getUTCMonth() !== m - 1) return null;
  return fecha;
}
