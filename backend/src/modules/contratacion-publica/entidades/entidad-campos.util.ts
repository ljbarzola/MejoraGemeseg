import { BadRequestException } from '@nestjs/common';

export const TIPOS_CAMPO = ['TEXTO', 'LISTA', 'NUMERO', 'FECHA'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const LARGO_MAXIMO_TEXTO = 300;
export const LARGO_MAXIMO_OPCION = 80;
export const MAXIMO_OPCIONES = 50;

/** Lo mínimo de un campo que hace falta para validar un valor. */
export interface CampoDefinicion {
  id: number;
  nombre: string;
  tipo: string;
  opciones: unknown;
  obligatorio: boolean;
  activo: boolean;
}

export type ValorCampo = string | number;

/** Campos que cada empresa recibe la primera vez: se pueden renombrar o desactivar. */
export const CAMPOS_DE_FABRICA: {
  nombre: string;
  tipo: TipoCampo;
  opciones?: string[];
}[] = [
  {
    nombre: 'Tipo de entidad',
    tipo: 'LISTA',
    opciones: [
      'Ministerio',
      'Gobierno autónomo descentralizado',
      'Empresa pública',
      'Universidad',
      'Otra',
    ],
  },
  { nombre: 'Contacto', tipo: 'TEXTO' },
  { nombre: 'Teléfono de contacto', tipo: 'TEXTO' },
  { nombre: 'Correo de contacto', tipo: 'TEXTO' },
];

/** Las opciones de una lista, ya limpias: sin vacías ni repetidas. */
export function limpiarOpciones(opciones: unknown): string[] {
  if (!Array.isArray(opciones)) return [];
  const vistas = new Set<string>();
  const limpias: string[] = [];
  for (const o of opciones) {
    if (typeof o !== 'string') continue;
    const texto = o.trim().slice(0, LARGO_MAXIMO_OPCION);
    const clave = texto.toLowerCase();
    if (!texto || vistas.has(clave)) continue;
    vistas.add(clave);
    limpias.push(texto);
  }
  return limpias.slice(0, MAXIMO_OPCIONES);
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function estaVacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function valorValido(campo: CampoDefinicion, v: unknown): ValorCampo {
  const mal = (detalle: string) =>
    new BadRequestException(`El campo «${campo.nombre}» ${detalle}`);
  switch (campo.tipo) {
    case 'NUMERO': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) throw mal('debe ser un número.');
      return n;
    }
    case 'FECHA': {
      const s = String(v).trim();
      if (!FECHA_ISO.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
        throw mal('debe ser una fecha válida.');
      }
      return s;
    }
    case 'LISTA': {
      const s = String(v).trim();
      if (!limpiarOpciones(campo.opciones).includes(s)) {
        throw mal('tiene un valor que no está en la lista de opciones.');
      }
      return s;
    }
    default: {
      const s = String(v).trim();
      if (s.length > LARGO_MAXIMO_TEXTO) {
        throw mal(`no puede pasar de ${LARGO_MAXIMO_TEXTO} caracteres.`);
      }
      return s;
    }
  }
}

/**
 * Deja los valores de una entidad listos para guardar.
 *
 * - Solo se validan los campos ACTIVOS; un valor que falte cuenta como vacío.
 * - Los valores de campos desactivados (o ya desconocidos) que la entidad ya
 *   tenía se conservan tal cual: desactivar un campo no borra datos.
 * - `exigirObligatorios`: un campo obligatorio vacío lanza un error con el
 *   nombre del campo.
 */
export function normalizarCamposExtra(
  enviados: Record<string, unknown> | null | undefined,
  campos: CampoDefinicion[],
  existentes: Record<string, unknown> | null | undefined,
  exigirObligatorios: boolean,
): Record<string, ValorCampo> {
  const resultado: Record<string, ValorCampo> = {};
  for (const [k, v] of Object.entries(existentes ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') resultado[k] = v;
  }
  for (const campo of campos) {
    if (!campo.activo) continue;
    const clave = String(campo.id);
    const v = enviados?.[clave];
    if (estaVacio(v)) {
      if (exigirObligatorios && campo.obligatorio) {
        throw new BadRequestException(`El campo «${campo.nombre}» es obligatorio.`);
      }
      delete resultado[clave];
      continue;
    }
    resultado[clave] = valorValido(campo, v);
  }
  return resultado;
}
