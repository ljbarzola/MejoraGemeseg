import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Archivos que tienen que sobrevivir a un reinicio de Cloud Run (plantillas
// .docx, PDFs de contratos). El disco de la instancia se borra cada vez que
// se recicla (min-instances=0), así que el contenido real se guarda en la
// tabla StoredFile y el disco queda solo como caché: se lee de ahí si está,
// y si no, se trae de la base y se vuelve a escribir.
//
// Son funciones sueltas que reciben el PrismaService (en vez de un servicio
// inyectable) para no cambiar el constructor de los servicios que las usan —
// sus specs los instancian a mano con `new XService(mockPrisma, ...)`.
//
// `key` es una ruta lógica estable ("ventas/contracts/<archivo>.pdf"), no la
// ruta del disco: la ruta absoluta cambia entre local y Cloud Run.

const logger = new Logger('StoredFile');

export async function saveStoredFile(
  prisma: PrismaService,
  key: string,
  localPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);
  // Prisma v7 tipa los Bytes como Uint8Array<ArrayBuffer>; un Buffer de Node
  // puede venir de un ArrayBufferLike, de ahí la copia.
  const data = new Uint8Array(buffer);
  await prisma.storedFile.upsert({
    where: { key },
    create: { key, data, contentType, size: buffer.length },
    update: { data, contentType, size: buffer.length },
  });
}

/**
 * Disco primero; si no está, la copia permanente (y se reescribe al disco).
 * Un archivo que estaba solo en disco (anterior a esta tabla) se copia a la
 * base la primera vez que se lee, para que no se pierda en el próximo
 * reinicio. null = no existe en ningún lado.
 */
export async function readStoredFile(
  prisma: PrismaService,
  key: string,
  localPath: string,
  contentType: string,
): Promise<Buffer | null> {
  if (fs.existsSync(localPath)) {
    const buffer = fs.readFileSync(localPath);
    const existing = await prisma.storedFile.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!existing) {
      await prisma.storedFile
        .create({
          data: { key, data: new Uint8Array(buffer), contentType, size: buffer.length },
        })
        .catch((err) =>
          logger.warn(`No se pudo respaldar ${key}: ${err?.message}`),
        );
    }
    return buffer;
  }

  const stored = await prisma.storedFile.findUnique({ where: { key } });
  if (!stored) return null;
  const buffer = Buffer.from(stored.data);
  try {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
  } catch {
    // Solo es caché: si no se puede escribir, se sirve igual desde memoria.
  }
  return buffer;
}

export async function deleteStoredFile(
  prisma: PrismaService,
  key: string,
  localPath: string,
): Promise<void> {
  if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  await prisma.storedFile.deleteMany({ where: { key } });
}
