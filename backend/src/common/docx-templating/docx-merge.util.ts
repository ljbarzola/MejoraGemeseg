import axios from 'axios';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
const htmlPdfNode = require('html-pdf-node');

// Lógica extraída de ventas-templates.service.ts / ventas-contratos.service.ts
// (probada en producción en el módulo de Ventas) para poder reutilizarla en
// Personal/RRHH sin depender de BoldSign ni de conceptos de cliente/anexos.

export function extractDriveFileId(url: string): string | null {
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

export async function downloadDocxFromDrive(driveUrl: string): Promise<Buffer> {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) {
    throw new Error(
      'Link de Drive no válido. Formatos aceptados: drive.google.com/file/d/{id}/view, drive.google.com/open?id={id}, docs.google.com/document/d/{id}/edit',
    );
  }

  const isGoogleDoc =
    driveUrl.includes('/document/') ||
    driveUrl.includes('/spreadsheets/') ||
    driveUrl.includes('/presentation/');

  const url = isGoogleDoc
    ? `https://docs.google.com/document/d/${fileId}/export?format=docx`
    : `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

  let response;
  try {
    response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      throw new Error(
        'Google rechazó la descarga: el documento no está compartido públicamente. Ábrelo en Drive/Docs → Compartir → cambia el acceso general a "Cualquier persona con el enlace" (como Lector) y vuelve a intentar.',
      );
    }
    throw err;
  }
  const buffer = Buffer.from(response.data);

  if (buffer.length < 100) {
    throw new Error('El archivo descargado es demasiado pequeño');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(
      'El archivo descargado no es un documento Word válido. Verifica que el link sea correcto y que el archivo esté compartido.',
    );
  }

  return buffer;
}

// Tolera espacios accidentales dentro de los corchetes ("[ NOMBRE ]" además
// de "[NOMBRE]") — fácil de escribir sin querer al armar la plantilla en
// Word, y sin esto la variable simplemente no se detectaba ni se rellenaba.
const BRACKET_VARIABLE_RE = '\\[\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\]';

// Detecta variables en formato [Variable] dentro del cuerpo, encabezados y
// pies de página del .docx. Solo se soporta este formato (no <<Variable>>)
// para que las instrucciones sean simples y sin ambigüedad para quien arma
// la plantilla.
//
// Limitación conocida (heredada del mismo enfoque en Ventas): si Word divide
// el placeholder en varias "runs" internas — típico cuando el corrector
// ortográfico o el autocorrector tocan el texto — puede no detectarse ni
// rellenarse aunque se vea como una sola palabra en pantalla. Si falta una
// variable que debería estar, lo más confiable es borrar ese placeholder y
// volver a escribirlo de una sola vez (o pegarlo como texto sin formato).
export async function detectDocxVariables(
  docxBuffer: Buffer,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(docxBuffer);

  const allTexts: string[] = [];
  for (const [fileName, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (
      fileName === 'word/document.xml' ||
      fileName.startsWith('word/header') ||
      fileName.startsWith('word/footer')
    ) {
      const content = await file.async('string');
      allTexts.push(content.replace(/<[^>]+>/g, ' '));
    }
  }

  const fullText = allTexts.join(' ');
  const detected = new Set<string>();
  const regexBrackets = new RegExp(BRACKET_VARIABLE_RE, 'g');

  let match;
  while ((match = regexBrackets.exec(fullText)) !== null)
    detected.add(match[1]);

  return Array.from(detected).sort();
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Sustituye [Key] por su valor en todo el XML del .docx y devuelve el .docx
// resultante ya relleno. El valor se escapa como texto XML (&, <, >) antes de
// insertarse — un valor con "&" o "<" sin escapar (ej. "Seguridad & Cía.")
// dejaría el .docx con XML inválido y mammoth fallaría al convertirlo.
export async function fillDocxTemplate(
  docxBuffer: Buffer,
  data: Record<string, string>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const updatedZip = new JSZip();

  for (const [fileName, file] of Object.entries(zip.files)) {
    if (file.dir) {
      updatedZip.folder(fileName);
      continue;
    }
    let content = await file.async('string');
    for (const [key, value] of Object.entries(data)) {
      const regexBrackets = new RegExp(`\\[\\s*${key}\\s*\\]`, 'g');
      content = content.replace(regexBrackets, escapeXmlText(String(value ?? '')));
    }
    updatedZip.file(fileName, content);
  }

  return updatedZip.generateAsync({ type: 'nodebuffer' });
}

// Convierte un .docx (ya relleno) a PDF: docx → HTML (mammoth) → PDF
// (html-pdf-node).
export async function docxBufferToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const { value: htmlBody } = await mammoth.convertToHtml({
    buffer: docxBuffer,
  });
  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 40px 60px; color: #000; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 11pt; }
  th { background: #f5f5f5; font-weight: bold; }
  p { margin: 4px 0; }
  h1 { font-size: 18pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; }
  img { max-width: 100%; height: auto; }
</style></head><body>${htmlBody}</body></html>`;

  return htmlPdfNode.generatePdf(
    { content: fullHtml },
    {
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    },
  );
}
