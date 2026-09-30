// Carpetas de Drive que RRHH/Ventas NO configuran desde la app.
// Cambiar un ID aquí (y redesplegar) es la única forma de moverlas.
//
// Reclutamiento debe coincidir con el portal de postulación
// (`GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID` en el repo RECLUTAMIENTO).
//
// Si el `id` de alguno de estos tipos queda vacío, getConfig lee la última
// fila de FolderConfig en solo lectura (ya no se puede guardar desde la
// app). Completar el id aquí ignora la BD del todo — así quedó fijado
// VENTAS_CONTRATOS el 2026-09-23 (antes estaba vacío y los PDFs generados
// no tenían ningún respaldo, solo el disco local no persistente de Cloud
// Run — ver backend/.agents/VENTAS-CLIENTES-QA-2026-09-23.md).

export const LOCKED_DRIVE_FOLDER_TYPES = [
  'RECLUTAMIENTO',
  'CAPACITACIONES',
  'VENTAS_CONTRATOS',
  'RRHH_DOCUMENTOS',
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
    id: '1KNDUzJR77Emdx1pwlee3b670OY0oaE9w',
    name: 'Capacitaciones',
  },
  VENTAS_CONTRATOS: {
    id: '1ENdOqnTCVsDztvNV4uqggkFXbHwA6U3Q',
    name: 'Contratos de ventas',
  },
  // Documentos generados desde RRHH > Documentación (contratos y demás
  // papeles de GUARDIAS). Nada que ver con VENTAS_CONTRATOS, que es el
  // subsistema de contratos de venta con firma electrónica: son dos flujos
  // distintos y no deben mezclarse.
  RRHH_DOCUMENTOS: {
    id: '1LLnPLU7UFSFvIwi-FpMNyIQDkoZI-B8s',
    name: 'Documentos generados (RRHH)',
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
