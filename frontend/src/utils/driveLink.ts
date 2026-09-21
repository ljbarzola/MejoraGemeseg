// Extrae el ID de una carpeta/archivo de Google Drive a partir del enlace
// completo que el usuario pega (en vez de pedirle que copie el ID a mano de
// la URL). Soporta los patrones más comunes de enlaces de Drive y, si lo que
// se pega ya es un ID plano, lo deja pasar tal cual.
export function extractDriveFolderId(input: string): string | null {
  const value = input.trim().replace(/\.+$/, '');
  if (!value) return null;

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/, // .../drive/folders/<id>
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/, // .../file/d/<id>/view
    /[?&]id=([a-zA-Z0-9_-]{10,})/, // ...?id=<id>
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  // No es una URL reconocida: si parece un ID plano de Drive (sin espacios
  // ni "/"), se acepta igual para no romper a quien ya lo pega así.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;

  return null;
}

// El backend solo guarda el ID (lo necesita así para llamar a la API de
// Drive), así que al recargar una configuración ya guardada no hay forma de
// recuperar el enlace exacto que la persona pegó. Para que el campo siga
// mostrando un enlace en vez de un ID pelado, se reconstruye uno equivalente
// y válido a partir del ID guardado.
export function buildDriveFolderLink(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
