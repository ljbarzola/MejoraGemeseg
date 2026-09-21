// Extrae el ID de una carpeta/archivo de Google Drive a partir del enlace
// completo que el usuario pega (en vez de exigirle que copie el ID a mano de
// la URL). Espejo de frontend/src/utils/driveLink.ts — duplicado a propósito
// (front y back son proyectos TS separados, sin código compartido entre
// ambos) para que la extracción funcione en el backend sin depender de que
// cada pantalla del frontend la haya aplicado antes de guardar.
export function extractDriveFolderId(input: string): string {
  const value = input?.trim().replace(/\.+$/, '') || '';
  if (!value) return '';

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/, // .../drive/folders/<id>
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/, // .../file/d/<id>/view
    /[?&]id=([a-zA-Z0-9_-]{10,})/, // ...?id=<id>
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  // No es una URL reconocida: si parece un ID plano de Drive, se acepta tal
  // cual (compatibilidad con quien ya lo pega así).
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;

  return value;
}
