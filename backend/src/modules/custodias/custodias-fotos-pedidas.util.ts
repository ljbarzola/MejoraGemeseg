// Fotos que se piden al custodio en cada momento del viaje (2026-11-24). Configurable por tipo de servicio y
// momento; cada pedido dice si es obligatorio y si admite varias fotos. Sin base de datos, para poder probarlo.

import { BadRequestException } from '@nestjs/common';

export const TIPOS_FOTOS_PEDIDAS = ['PUERTO', 'HACIENDA', 'VIP'] as const;
export type TipoFotosPedidas = (typeof TIPOS_FOTOS_PEDIDAS)[number];
export const MOMENTOS_FOTOS_PEDIDAS = ['SALIDA', 'LLEGADA'] as const;
export type MomentoFotosPedidas = (typeof MOMENTOS_FOTOS_PEDIDAS)[number];

export const MAX_FOTOS_PEDIDAS = 8;
export const MAX_NOMBRE_FOTO_PEDIDA = 40;

export interface FotoPedida {
  nombre: string;
  /** Si falta, el custodio tiene que escribir por qué antes de continuar. */
  obligatoria: boolean;
  /** Admite más de una foto (ej. la carga se ve desde varios lados). */
  varias: boolean;
}

export type FotosPedidasMomento = Record<MomentoFotosPedidas, FotoPedida[]>;
export type FotosPedidas = Record<TipoFotosPedidas, FotosPedidasMomento>;

const pedida = (nombre: string): FotoPedida => ({ nombre, obligatoria: true, varias: true });

/** Lo que se pide mientras la empresa no guarde otra cosa. */
export function fotosPedidasPorDefecto(): FotosPedidas {
  return {
    PUERTO: { SALIDA: [pedida('Carga'), pedida('Sellos')], LLEGADA: [pedida('Carga')] },
    HACIENDA: { SALIDA: [pedida('Carga')], LLEGADA: [pedida('Carga')] },
    VIP: { SALIDA: [], LLEGADA: [] },
  };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clave = (nombre: string) => nombre.trim().toLowerCase();

/** Lo guardado puede venir como objeto o como texto (JSONB); un valor roto cae al texto por defecto. */
function limpiarLista(lista: unknown): FotoPedida[] | null {
  if (!Array.isArray(lista)) return null;
  const vistos = new Set<string>();
  const salida: FotoPedida[] = [];
  for (const x of lista) {
    if (!esObjeto(x) || typeof x.nombre !== 'string') continue;
    const nombre = x.nombre.trim().slice(0, MAX_NOMBRE_FOTO_PEDIDA);
    if (!nombre || vistos.has(clave(nombre))) continue;
    vistos.add(clave(nombre));
    salida.push({ nombre, obligatoria: x.obligatoria !== false, varias: x.varias === true });
    if (salida.length >= MAX_FOTOS_PEDIDAS) break;
  }
  return salida;
}

/** Lectura tolerante: lo que falta o está dañado se completa con lo de por defecto. */
export function resolverFotosPedidas(guardado: unknown): FotosPedidas {
  let crudo: unknown = guardado;
  if (typeof crudo === 'string') {
    try {
      crudo = JSON.parse(crudo);
    } catch {
      crudo = null;
    }
  }
  const defecto = fotosPedidasPorDefecto();
  if (!esObjeto(crudo)) return defecto;
  for (const tipo of TIPOS_FOTOS_PEDIDAS) {
    const delTipo = crudo[tipo];
    if (!esObjeto(delTipo)) continue;
    for (const momento of MOMENTOS_FOTOS_PEDIDAS) {
      const lista = limpiarLista(delTipo[momento]);
      if (lista) defecto[tipo][momento] = lista;
    }
  }
  return defecto;
}

/** Revisión estricta de lo que manda la pantalla de configuración (con mensajes en español). */
export function normalizarFotosPedidas(valor: unknown): FotosPedidas {
  if (!esObjeto(valor)) throw new BadRequestException('La lista de fotos no es válida.');
  const resultado = fotosPedidasPorDefecto();
  const nombreTipo: Record<TipoFotosPedidas, string> = { PUERTO: 'Puerto', HACIENDA: 'Hacienda', VIP: 'VIP' };
  const nombreMomento: Record<MomentoFotosPedidas, string> = { SALIDA: 'al salir', LLEGADA: 'al llegar' };
  for (const tipo of TIPOS_FOTOS_PEDIDAS) {
    const delTipo = valor[tipo];
    if (delTipo === undefined) continue;
    if (!esObjeto(delTipo)) throw new BadRequestException('La lista de fotos no es válida.');
    for (const momento of MOMENTOS_FOTOS_PEDIDAS) {
      const lista = delTipo[momento];
      if (lista === undefined) continue;
      const donde = `${nombreTipo[tipo]}, ${nombreMomento[momento]}`;
      if (!Array.isArray(lista)) throw new BadRequestException(`La lista de fotos de ${donde} no es válida.`);
      if (lista.length > MAX_FOTOS_PEDIDAS) {
        throw new BadRequestException(`Máximo ${MAX_FOTOS_PEDIDAS} fotos en ${donde}.`);
      }
      const vistos = new Set<string>();
      const salida: FotoPedida[] = [];
      for (const x of lista) {
        const nombre = esObjeto(x) && typeof x.nombre === 'string' ? x.nombre.trim() : '';
        if (!nombre) throw new BadRequestException(`Escribe el nombre de cada foto en ${donde}.`);
        if (nombre.length > MAX_NOMBRE_FOTO_PEDIDA) {
          throw new BadRequestException(`«${nombre.slice(0, 20)}…» es muy largo: máximo ${MAX_NOMBRE_FOTO_PEDIDA} letras.`);
        }
        if (vistos.has(clave(nombre))) throw new BadRequestException(`«${nombre}» está repetida en ${donde}.`);
        vistos.add(clave(nombre));
        const o = x as Record<string, unknown>;
        salida.push({ nombre, obligatoria: o.obligatoria !== false, varias: o.varias === true });
      }
      resultado[tipo][momento] = salida;
    }
  }
  return resultado;
}

/** Las listas de un viaje según su tipo de servicio (un tipo desconocido no pide fotos). */
export function fotosPedidasDeViaje(todas: FotosPedidas, tipo: string): FotosPedidasMomento {
  return (TIPOS_FOTOS_PEDIDAS as readonly string[]).includes(tipo)
    ? todas[tipo as TipoFotosPedidas]
    : { SALIDA: [], LLEGADA: [] };
}
