import { createHash, randomBytes, randomInt } from 'crypto';
import { minutosDelDia, ZONA_ECUADOR } from './bitacora-fecha.util';

/**
 * Lógica pura de la extensión del navegador: horario, dominios, tramos y
 * códigos de vinculación. Sin base de datos, para poder probarla sola.
 */

export interface Horario {
  /** 1 = lunes ... 7 = domingo. */
  dias: number[];
  /** «HH:MM», hora de Ecuador. */
  inicio: string;
  fin: string;
}

export interface HorarioPublico extends Horario {
  zona: string;
}

export interface Tramo {
  dominio: string;
  inicio: Date;
  minutos: number;
}

export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7];
/** Un tramo nunca dura más que esto: la extensión envía cada pocos minutos. */
export const TRAMO_MAXIMO_MINUTOS = 10;
/** Cuántos tramos acepta una sola petición. */
export const TRAMOS_POR_PETICION = 200;
/** No se aceptan tramos más viejos que esto (la extensión reintenta mientras no tiene conexión). */
export const ANTIGUEDAD_MAXIMA_MS = 48 * 3_600_000;
const FUTURO_TOLERADO_MS = 2 * 60_000;
export const CODIGO_VIGENCIA_MS = 10 * 60_000;

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Alfabeto sin 0/O, 1/I/L: el código se teclea a mano.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;

export function esHoraValida(valor: unknown): valor is string {
  return typeof valor === 'string' && HORA_RE.test(valor);
}

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Valida lo que llega del formulario de horario. Devuelve el mensaje de error, o null si está bien. */
export function errorDeHorario(h: Partial<Horario>): string | null {
  if (!Array.isArray(h.dias) || h.dias.length === 0) {
    return 'Elige al menos un día de la semana.';
  }
  if (!h.dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
    return 'Los días elegidos no son válidos.';
  }
  if (!esHoraValida(h.inicio) || !esHoraValida(h.fin)) {
    return 'Escribe la hora de inicio y la de fin, por ejemplo 08:00 y 17:00.';
  }
  if (aMinutos(h.fin) <= aMinutos(h.inicio)) {
    return 'La hora de fin debe ser posterior a la de inicio.';
  }
  return null;
}

export function diasATexto(dias: number[]): string {
  return [...new Set(dias)].sort((a, b) => a - b).join(',');
}

export function diasDeTexto(texto: string): number[] {
  return texto
    .split(',')
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

/** Día de la semana en Ecuador: 1 = lunes ... 7 = domingo. */
export function diaSemanaEcuador(instante: Date): number {
  const local = new Date(instante.getTime() - 5 * 3_600_000);
  return local.getUTCDay() === 0 ? 7 : local.getUTCDay();
}

/** ¿Ese instante cae dentro del horario? (hora de Ecuador; el minuto de fin ya no cuenta). */
export function dentroDelHorario(horario: Horario, instante: Date): boolean {
  if (!horario.dias.includes(diaSemanaEcuador(instante))) return false;
  const minuto = minutosDelDia(instante);
  return minuto >= aMinutos(horario.inicio) && minuto < aMinutos(horario.fin);
}

export function horarioPublico(h: Horario): HorarioPublico {
  return { dias: h.dias, inicio: h.inicio, fin: h.fin, zona: ZONA_ECUADOR };
}

/**
 * Solo el dominio, nunca la dirección completa: «https://www.Banco.com/cuenta?x=1»
 * llega como «banco.com». Devuelve null si no parece un dominio de internet
 * (direcciones IP, «localhost», páginas internas del navegador...).
 */
export function normalizarDominio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  let d = valor.trim().toLowerCase().replace(/\.$/, '');
  if (d.startsWith('www.')) d = d.slice(4);
  if (d.length < 3 || d.length > 100) return null;
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)
  ) {
    return null;
  }
  // Una dirección IP termina en un número; un dominio real, en letras.
  const ultimo = d.slice(d.lastIndexOf('.') + 1);
  if (/^\d+$/.test(ultimo)) return null;
  return d;
}

export interface TramosValidados {
  validos: Tramo[];
  descartados: number;
}

/**
 * Filtra lo que envía la extensión: se queda solo con los tramos bien formados,
 * recientes, que no estén en el futuro y que caigan por completo dentro del
 * horario. Todo lo demás se descarta sin guardarse.
 */
export function validarTramos(
  entrada: unknown,
  horario: Horario,
  desde: Date | null,
  ahora: Date = new Date(),
): TramosValidados {
  const lista = Array.isArray(entrada)
    ? entrada.slice(0, TRAMOS_POR_PETICION)
    : [];
  let descartados = Array.isArray(entrada)
    ? Math.max(0, entrada.length - TRAMOS_POR_PETICION)
    : 0;
  const validos: Tramo[] = [];
  const vistos = new Set<string>();

  for (const t of lista) {
    const crudo = t as {
      dominio?: unknown;
      inicio?: unknown;
      minutos?: unknown;
    };
    const dominio = normalizarDominio(crudo?.dominio);
    const inicio =
      typeof crudo?.inicio === 'string' ? new Date(crudo.inicio) : null;
    const minutos = Number(crudo?.minutos);
    if (
      !dominio ||
      !inicio ||
      Number.isNaN(inicio.getTime()) ||
      !Number.isInteger(minutos) ||
      minutos < 1 ||
      minutos > TRAMO_MAXIMO_MINUTOS
    ) {
      descartados++;
      continue;
    }
    // El tramo empieza en un minuto exacto.
    const inicioMinuto = new Date(
      Math.floor(inicio.getTime() / 60_000) * 60_000,
    );
    const fin = new Date(inicioMinuto.getTime() + (minutos - 1) * 60_000);
    if (
      inicioMinuto.getTime() < ahora.getTime() - ANTIGUEDAD_MAXIMA_MS ||
      fin.getTime() > ahora.getTime() + FUTURO_TOLERADO_MS ||
      (desde && inicioMinuto.getTime() < desde.getTime()) ||
      !dentroDelHorario(horario, inicioMinuto) ||
      !dentroDelHorario(horario, fin)
    ) {
      descartados++;
      continue;
    }
    const clave = `${dominio}|${inicioMinuto.toISOString()}`;
    if (vistos.has(clave)) {
      descartados++;
      continue;
    }
    vistos.add(clave);
    validos.push({ dominio, inicio: inicioMinuto, minutos });
  }
  return { validos, descartados };
}

/** Identificador estable del tramo: reenviarlo (reintento sin conexión) no lo duplica. */
export function externalIdDeTramo(userId: number, t: Tramo): string {
  return `${userId}|${t.dominio}|${t.inicio.toISOString()}`;
}

export function hashear(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

/** Código de 8 caracteres que la persona teclea en la extensión, p. ej. «K7M2-9QXP». */
export function generarCodigo(): string {
  let c = '';
  for (let i = 0; i < LARGO_CODIGO; i++) {
    c += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  }
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Quita guiones y espacios y pasa a mayúsculas: «k7m2 9qxp» y «K7M2-9QXP» son el mismo código. */
export function normalizarCodigo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const c = valor.replace(/[\s-]/g, '').toUpperCase();
  if (c.length !== LARGO_CODIGO) return null;
  return [...c].every((ch) => ALFABETO_CODIGO.includes(ch)) ? c : null;
}

export function generarToken(): string {
  return `bx_${randomBytes(32).toString('base64url')}`;
}

/** Quita el «Bearer » de la cabecera Authorization. */
export function tokenDeCabecera(cabecera: unknown): string | null {
  if (typeof cabecera !== 'string') return null;
  const m = /^Bearer\s+(bx_[A-Za-z0-9_-]{20,100})$/.exec(cabecera.trim());
  return m ? m[1] : null;
}
