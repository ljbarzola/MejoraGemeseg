// Carpetas de Drive que RRHH/Ventas NO configuran desde la app.
// Cambiar un ID aquí (y redesplegar) es la única forma de moverlas.
//
// Reclutamiento debe coincidir con el portal de postulación
// (`GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID` en el repo RECLUTAMIENTO).
//
// Capacitaciones y Contratos de ventas: si el `id` está vacío, getConfig
// lee la última fila de FolderConfig en solo lectura (ya no se puede
// guardar). Completa el id aquí para ignorar la BD del todo.

export const LOCKED_DRIVE_FOLDER_TYPES = [
  'RECLUTAMIENTO',
  'CAPACITACIONES',
  'VENTAS_CONTRATOS',
] as const;

export type LockedDriveFolderType =
  (typeof LOCKED_DRIVE_FOLDER_TYPES)[number];

export const CONFIGURABLE_DRIVE_FOLDER_TYPES = [
  'CUMPLIMIENTO',
  'PERSONAL_ADMIN',
  'GUARDIAS_ARCHIVO',
] as const;

export type ConfigurableDriveFolderType =
  (typeof CONFIGURABLE_DRIVE_FOLDER_TYPES)[number];

export const HARDCODED_DRIVE_FOLDERS: Record<
  LockedDriveFolderType,
  { id: string; name: string }
> = {
  RECLUTAMIENTO: {
    id: '1VM4Ypbbs0xOBvt-TSLQqQuSrTEUp_Bru',
    name: 'Reclutamiento',
  },
  CAPACITACIONES: {
    id: '',
    name: 'Capacitaciones',
  },
  VENTAS_CONTRATOS: {
    id: '',
    name: 'Contratos de ventas',
  },
};

export function isLockedDriveFolderType(
  type: string,
): type is LockedDriveFolderType {
  return (LOCKED_DRIVE_FOLDER_TYPES as readonly string[]).includes(type);
}

export function driveFolderPublicUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function hardcodedFolderId(type: string): string {
  if (!isLockedDriveFolderType(type)) return '';
  return HARDCODED_DRIVE_FOLDERS[type].id?.trim() || '';
}
