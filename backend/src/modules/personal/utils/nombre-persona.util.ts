// Estándar único de nombre de persona en RRHH (2026-09-22).
//
// Reclutamiento, Listado de Guardias y Personal Administrativo nombraban sus
// carpetas de Drive cada uno a su manera ("Apellidos - Nombres",
// "Apellidos Nombres - Cédula - Puesto", "Nombre - Puesto"), y los listados
// mostraban lo que cayera. Desde ahora hay UN solo formato en todas partes:
//
//     APELLIDOS NOMBRES
//
// sin guion, sin cédula y sin puesto. La cédula y el puesto NO se pierden:
// viajan dentro de datos.json / candidato.json, que vive en la misma carpeta
// (ver DriveService.syncFichaPersonal / syncFichaAdministrativo), y ese JSON
// es lo que el sync lee para resolver la identidad de la carpeta.
//
// Las carpetas viejas NO se renombran: los parsers siguen leyendo los tres
// formatos antiguos y el sync solo REPORTA las que no cumplen el estándar,
// para que RRHH las corrija en Drive cuando quiera.

/** Junta apellidos y nombres en el formato estándar. Devuelve '' si no hay nada que juntar. */
export function formatNombrePersona(
  apellidos?: string | null,
  nombres?: string | null,
): string {
  return [apellidos, nombres]
    .map((p) => (p || '').trim())
    .filter((p) => p.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza un nombre ya armado (colapsa espacios) sin cambiar mayúsculas ni tildes. */
export function normalizarNombrePersona(nombre?: string | null): string {
  return (nombre || '').replace(/\s+/g, ' ').trim();
}

export interface ValidacionNombrePersona {
  valido: boolean;
  /** Motivo legible para mostrarle a RRHH. Vacío cuando `valido` es true. */
  motivo: string;
}

/**
 * Informativo, nunca bloquea nada: dice si el nombre de una carpeta ya sigue
 * el estándar. Sirve para las advertencias del sync sobre carpetas viejas.
 */
export function validarNombrePersona(
  nombre?: string | null,
): ValidacionNombrePersona {
  const limpio = normalizarNombrePersona(nombre);
  if (!limpio) {
    return { valido: false, motivo: 'la carpeta no tiene nombre' };
  }
  if (/\d{10}/.test(limpio)) {
    return {
      valido: false,
      motivo:
        'incluye la cédula en el nombre (ahora va solo dentro de datos.json)',
    };
  }
  if (/\s-\s|^-|-$/.test(limpio) || limpio.includes('-')) {
    return {
      valido: false,
      motivo: 'incluye un guion (el formato es "Apellidos Nombres", sin guion)',
    };
  }
  return { valido: true, motivo: '' };
}

/** Mensaje completo para la lista de advertencias del sync. */
export function advertenciaNombreCarpeta(nombreCarpeta: string): string {
  const { motivo } = validarNombrePersona(nombreCarpeta);
  return `La carpeta "${nombreCarpeta}" no sigue el formato "Apellidos Nombres": ${motivo}. Se sincronizó igual; renómbrala en Drive cuando puedas.`;
}
