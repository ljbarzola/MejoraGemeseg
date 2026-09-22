// Separación de un nombre en apellidos y nombres, para mostrarlos en columnas
// distintas (Listado de Guardias, Personal Administrativo).
//
// El estándar de carpeta es "APELLIDOS NOMBRES" en una sola cadena, sin
// separador (ver nombre-persona.util.ts), así que de la cadena sola NO se
// puede saber con certeza dónde terminan los apellidos. Por eso hay dos vías,
// en este orden:
//
//   1. EXACTA: el formulario de postulación guarda "Apellidos" y "Nombres" en
//      campos separados, y ese dato viaja en el stash de postulación de la
//      ficha. Cuando está, se usa tal cual.
//   2. APROXIMADA: se asume la convención ecuatoriana de DOS apellidos —
//      las dos primeras palabras son apellidos y el resto nombres. Se marca
//      con `exacto: false` para que la interfaz pueda advertirlo, en vez de
//      presentar una separación inventada como si fuera un dato real.
//
// Nunca se inventa: si solo hay una palabra, va entera a apellidos.

import { buscarDatoFormulario, POSTULACION_STASH_KEY } from './form-data.util';

export interface NombreSeparado {
  apellidos: string;
  nombres: string;
  /** false = deducido de la cadena, no viene del formulario de postulación. */
  exacto: boolean;
}

/** Separación aproximada: dos primeras palabras = apellidos. */
export function separarNombreAproximado(nombreCompleto: string): NombreSeparado {
  const partes = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { apellidos: '', nombres: '', exacto: false };
  if (partes.length === 1) return { apellidos: partes[0], nombres: '', exacto: false };
  if (partes.length === 2) {
    return { apellidos: partes[0], nombres: partes[1], exacto: false };
  }
  return {
    apellidos: partes.slice(0, 2).join(' '),
    nombres: partes.slice(2).join(' '),
    exacto: false,
  };
}

/**
 * Usa el formulario de postulación si está disponible; si no, deduce.
 * `camposPersonalizados` es el JSON crudo de la ficha (con el stash dentro).
 */
export function separarNombre(
  nombreCompleto: string,
  camposPersonalizados?: Record<string, unknown> | null,
): NombreSeparado {
  const stash = camposPersonalizados?.[POSTULACION_STASH_KEY];
  if (stash && typeof stash === 'object') {
    const datos = stash as Record<string, unknown>;
    const apellidos = buscarDatoFormulario(datos, ['apellidos']);
    const nombres = buscarDatoFormulario(datos, ['nombres']);
    if (apellidos && nombres) {
      return { apellidos, nombres, exacto: true };
    }
  }
  return separarNombreAproximado(nombreCompleto);
}
