// Reglas puras de las custodias en campo (2026-11-24, Fase 1): correos, marcadores del mensaje y fechas.
// Sin base de datos, para poder probarlas.

import { BadRequestException } from '@nestjs/common';

export const MOMENTOS_FIRMA = ['SALIDA', 'LLEGADA', 'AMBOS'] as const;
export type MomentoFirma = (typeof MOMENTOS_FIRMA)[number];

export const esMomentoFirma = (v: unknown): v is MomentoFirma =>
  typeof v === 'string' && (MOMENTOS_FIRMA as readonly string[]).includes(v);

const CORREO_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export const esCorreo = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && CORREO_RE.test(v.trim());

/**
 * Valida y limpia una lista de correos: sin repetidos (sin importar mayúsculas) y con un máximo.
 * `min` en 1 exige al menos uno. Devuelve la lista en minúsculas y sin espacios.
 */
export function normalizarCorreos(
  lista: unknown,
  opciones: { max: number; min?: number; etiqueta: string },
): string[] {
  if (lista === undefined || lista === null) lista = [];
  if (!Array.isArray(lista)) {
    throw new BadRequestException(`La lista de ${opciones.etiqueta} no es válida.`);
  }
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const item of lista) {
    const correo = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (!esCorreo(correo)) {
      throw new BadRequestException(
        `«${typeof item === 'string' ? item.trim().slice(0, 60) : '?'}» no es un correo válido.`,
      );
    }
    if (vistos.has(correo)) continue;
    vistos.add(correo);
    limpios.push(correo);
  }
  if (limpios.length > opciones.max) {
    throw new BadRequestException(`Máximo ${opciones.max} correos en ${opciones.etiqueta}.`);
  }
  if (limpios.length < (opciones.min ?? 0)) {
    throw new BadRequestException(`Agrega al menos un correo en ${opciones.etiqueta}.`);
  }
  return limpios;
}

/** dd/mm/aaaa en hora de Ecuador (UTC-5). */
export function fechaEcuador(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  const d = new Date(new Date(fecha).getTime() - 5 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Reemplaza los marcadores {guia}, {cliente} y {fecha} del asunto y del texto del correo. */
export function reemplazarMarcadores(
  texto: string,
  valores: { guia: string; cliente: string; fecha: string },
): string {
  return (texto ?? '')
    .replace(/\{guia\}/gi, valores.guia)
    .replace(/\{cliente\}/gi, valores.cliente)
    .replace(/\{fecha\}/gi, valores.fecha);
}

/** Nombre normalizado para detectar un cliente repetido: sin tildes, sin mayúsculas, sin espacios de más. */
export function nombreNormalizado(nombre: string): string {
  return (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Los valores de una lista [{label, value}] (correos o teléfonos de un contacto), sin vacíos. */
export function valoresDeLista(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((x) => (x && typeof x === 'object' ? String((x as { value?: unknown }).value ?? '').trim() : ''))
    .filter(Boolean);
}

/** Lee una columna JSONB que a veces llega ya como objeto y a veces como texto. */
export function leerJson<T>(valor: unknown, defecto: T): T {
  if (valor === null || valor === undefined) return defecto;
  if (typeof valor === 'string') {
    try {
      return JSON.parse(valor) as T;
    } catch {
      return defecto;
    }
  }
  return valor as T;
}
