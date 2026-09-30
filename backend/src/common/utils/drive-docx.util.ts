import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

// Descarga un .docx a partir del enlace de Drive que pega el usuario (archivo
// compartido como "Cualquier persona con el enlace"). Mismo mecanismo que ya
// usa VentasTemplatesService.downloadFromDrive: los Google Docs se exportan a
// .docx, los archivos subidos se bajan directo. Vive acá para que
// Contratación Pública no copie esa lógica por tercera vez.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function extractDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function downloadDocxFromDriveLink(url: string): Promise<Buffer> {
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    throw new BadRequestException(
      'Link de Drive no válido. Formatos aceptados: drive.google.com/file/d/{id}/view, drive.google.com/open?id={id}, docs.google.com/document/d/{id}/edit',
    );
  }

  const exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=docx`;
  const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  // Un .docx subido a Drive y abierto en Docs también tiene enlace
  // /document/…, así que se prueban las dos vías, empezando por la más
  // probable según el enlace.
  const urls = url.includes('/document/')
    ? [exportUrl, directUrl]
    : [directUrl, exportUrl];

  for (const downloadUrl of urls) {
    try {
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 5,
        headers: { 'User-Agent': UA },
      });
      const buffer = Buffer.from(response.data);
      // Un .docx es un ZIP (firma "PK"). Si Drive devolvió la página de
      // login o de "solicitar acceso", no empieza así.
      if (buffer.length >= 100 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        return buffer;
      }
    } catch {
      // se intenta la otra vía
    }
  }

  throw new BadRequestException(
    'No se pudo descargar el documento Word de Drive. Verifica que el enlace sea correcto y que esté compartido como "Cualquier persona con el enlace".',
  );
}
