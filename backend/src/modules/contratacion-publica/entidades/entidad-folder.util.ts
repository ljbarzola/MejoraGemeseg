/**
 * Tipo de carpeta de Drive (FolderConfig.type): la carpeta raíz ÚNICA de
 * Contratación Pública. Cada entidad tiene una subcarpeta ahí dentro.
 */
export const DRIVE_FOLDER_TYPE_ENTREGAS = 'CP_ENTREGAS';

/** Nombre apto para una carpeta o archivo de Drive (sin caracteres prohibidos, máx. 120). */
export function nombreCarpeta(texto: string): string {
  return (
    texto
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Sin nombre'
  );
}

/**
 * Clave para comparar nombres de entidad/carpeta: sin diferencias de
 * mayúsculas ni de espacios. Misma regla que `DriveService.findChildFolderByName`
 * (no quita tildes), así lo que Drive considera "la misma carpeta" coincide con
 * lo que el sistema considera "la misma entidad".
 */
export function claveNombre(texto: string): string {
  return nombreCarpeta(texto).toLocaleLowerCase('es');
}
