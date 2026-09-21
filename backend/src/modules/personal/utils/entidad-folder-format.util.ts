// Validación puramente informativa del formato "Provincia - Nombre de la
// entidad" que RRHH pide para las carpetas de Entidad en Drive (Fase 3.2 del
// plan de Entidades/Cumplimiento). No se persiste en base de datos ni bloquea
// nada — solo se usa para mostrar una advertencia visual en el sync y en el
// listado de Entidades. Un nombre de una sola palabra (ej. "Matriz", sin
// " - ") es un falso positivo conocido y aceptado: se reporta como inválido
// igual que cualquier otro caso, no hace falta una lista de excepciones.

const PROVINCIAS_ECUADOR = [
  'Azuay',
  'Bolívar',
  'Cañar',
  'Carchi',
  'Chimborazo',
  'Cotopaxi',
  'El Oro',
  'Esmeraldas',
  'Galápagos',
  'Guayas',
  'Imbabura',
  'Loja',
  'Los Ríos',
  'Manabí',
  'Morona Santiago',
  'Napo',
  'Orellana',
  'Pastaza',
  'Pichincha',
  'Santa Elena',
  'Santo Domingo de los Tsáchilas',
  'Sucumbíos',
  'Tungurahua',
  'Zamora Chinchipe',
];

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .trim()
    .toLowerCase();
}

const PROVINCIAS_NORMALIZADAS = new Set(
  PROVINCIAS_ECUADOR.map((p) => normalizar(p)),
);

export interface ValidacionFormatoEntidad {
  valido: boolean;
}

// Espera el formato "Provincia - Nombre de la entidad": separador " - " y la
// parte antes del guion debe ser una de las 24 provincias del Ecuador
// (comparado sin tildes ni mayúsculas).
export function validarFormatoEntidad(
  nombre: string,
): ValidacionFormatoEntidad {
  if (!nombre) return { valido: false };
  const partes = nombre.split(' - ');
  if (partes.length < 2) return { valido: false };

  const provincia = normalizar(partes[0]);
  const resto = partes.slice(1).join(' - ').trim();
  if (!resto) return { valido: false };

  return { valido: PROVINCIAS_NORMALIZADAS.has(provincia) };
}
