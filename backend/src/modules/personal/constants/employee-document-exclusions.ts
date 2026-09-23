// Archivos internos que el propio sistema escribe en la carpeta de Drive de
// un empleado (ficha personal, trazas de Reclutamiento/IA) — nunca deben
// tratarse como un documento subido por la persona. Antes solo se excluía
// Datos_Personales.json (y solo en el sync de Guardias); candidato.json y los
// archivos de análisis con IA quedaban como "documento no identificado" tanto
// en Guardias como en Personal Administrativo. Lista de nombres exactos
// (no por extensión) para no ocultar por accidente un documento real que
// alguien haya nombrado igual a un .json legítimo.
// `datos.json` unifica el nombre de este archivo para Guardias y Personal
// Administrativo (antes solo existía para Guardias, como
// "Datos_Personales.json"). El nombre viejo se mantiene aquí solo para
// detectar y migrar en el sync los archivos ya creados con el nombre
// anterior — todo archivo nuevo usa FICHA_PERSONAL_FILENAME.
export const FICHA_PERSONAL_FILENAME = 'datos.json';
export const FICHA_PERSONAL_FILENAME_LEGACY = 'Datos_Personales.json';
export const CANDIDATO_JSON_FILENAME = 'candidato.json';
export const ANALISIS_IA_FILENAME = 'analisis-ia.json';
export const ANALISIS_IA_PENDIENTE_FILENAME = 'analisis-ia-pendiente.json';

// Lo escribe "quitar de la lista" en la carpeta de un guardia que ya está
// fuera. El sync lo ve y no vuelve a crear el registro. No es un documento
// de la persona.
export const NO_MOSTRAR_EN_LISTA_FILENAME = 'no-mostrar-en-lista.txt';

export const NON_DOCUMENT_FILENAMES: readonly string[] = [
  FICHA_PERSONAL_FILENAME,
  FICHA_PERSONAL_FILENAME_LEGACY,
  CANDIDATO_JSON_FILENAME,
  ANALISIS_IA_FILENAME,
  ANALISIS_IA_PENDIENTE_FILENAME,
  NO_MOSTRAR_EN_LISTA_FILENAME,
];
