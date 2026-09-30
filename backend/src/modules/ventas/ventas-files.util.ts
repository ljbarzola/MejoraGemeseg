import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  readStoredFile,
  saveStoredFile,
  deleteStoredFile,
} from '../../common/utils/stored-file.util';
import { downloadDocxFromDriveLink } from '../../common/utils/drive-docx.util';

// Dónde viven los archivos de Ventas: plantillas .docx y PDFs de contratos
// (generados, firmados). Antes solo en el disco de Cloud Run, que se borra al
// reciclarse la instancia — tras un reinicio "Generar PDF" pedía volver a
// descargar la plantilla y "Ver"/"Enviar a firma" daban "PDF no encontrado".
// Ahora todo pasa por StoredFile (copia permanente en la base).

export const TEMPLATES_DIR = path.resolve(process.cwd(), 'uploads', 'templates');
export const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = 'application/pdf';

const templateKey = (fileName: string) => `ventas/templates/${fileName}`;
const contractKey = (fileName: string) => `ventas/contracts/${fileName}`;

/** Guarda el .docx de una plantilla y devuelve la ruta local para `docxPath`. */
export async function saveTemplateDocx(
  prisma: PrismaService,
  templateId: number,
  buffer: Buffer,
): Promise<string> {
  const fileName = `${templateId}_${Date.now()}.docx`;
  const localPath = path.join(TEMPLATES_DIR, fileName);
  await saveStoredFile(prisma, templateKey(fileName), localPath, buffer, DOCX);
  return localPath;
}

/**
 * .docx de la plantilla: disco → copia permanente → (si se perdió antes de
 * existir la copia permanente) se vuelve a bajar del enlace de Drive. null =
 * no hay forma de recuperarlo; hay que volver a subirlo.
 */
export async function loadTemplateDocx(
  prisma: PrismaService,
  template: { id: number; docxPath: string | null; driveUrl: string | null },
): Promise<Buffer | null> {
  if (template.docxPath) {
    const fileName = path.basename(template.docxPath);
    const buffer = await readStoredFile(
      prisma,
      templateKey(fileName),
      path.join(TEMPLATES_DIR, fileName),
      DOCX,
    );
    if (buffer) return buffer;
  }
  if (!template.driveUrl) return null;

  const buffer = await downloadDocxFromDriveLink(template.driveUrl).catch(() => null);
  if (!buffer) return null;
  const docxPath = await saveTemplateDocx(prisma, template.id, buffer);
  await prisma.salesTemplate.update({
    where: { id: template.id },
    data: { docxPath },
  });
  return buffer;
}

export async function deleteTemplateDocx(
  prisma: PrismaService,
  docxPath: string | null,
): Promise<void> {
  if (!docxPath) return;
  const fileName = path.basename(docxPath);
  await deleteStoredFile(prisma, templateKey(fileName), path.join(TEMPLATES_DIR, fileName));
}

export async function saveContractPdf(
  prisma: PrismaService,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  await saveStoredFile(
    prisma,
    contractKey(fileName),
    path.join(CONTRACTS_DIR, fileName),
    buffer,
    PDF,
  );
}

export async function loadContractPdf(
  prisma: PrismaService,
  fileName: string,
): Promise<Buffer | null> {
  return readStoredFile(
    prisma,
    contractKey(fileName),
    path.join(CONTRACTS_DIR, fileName),
    PDF,
  );
}

export async function deleteContractPdf(
  prisma: PrismaService,
  fileName: string,
): Promise<void> {
  await deleteStoredFile(prisma, contractKey(fileName), path.join(CONTRACTS_DIR, fileName));
}
