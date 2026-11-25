import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { deleteStoredFile, readStoredFile, saveStoredFile } from '../../common/utils/stored-file.util';

const ALCANCE_STORAGE = 'https://www.googleapis.com/auth/devstorage.read_write';
const RAIZ_LOCAL = path.resolve(process.cwd(), 'uploads', 'custodias');
// Las claves las genera el servidor (números y un uuid ya validado), pero igual se verifica antes de tocar el disco.
const CLAVE_RE = /^custodias\/\d+\/\d+\/(fotos|firmas)\/[A-Za-z0-9-]+(-min)?\.(jpg|png)$/;

/**
 * Dónde viven las fotos y las firmas de los viajes (2026-11-24, Fase 2).
 * - Con la variable `CUSTODIAS_FOTOS_BUCKET`: un bucket de Google Cloud Storage, por su API JSON con axios y el
 *   token de la cuenta de servicio (sin dependencias nuevas).
 * - Sin ella: la tabla `StoredFile` (copia permanente en la base) con el disco solo de caché.
 * Las claves son lógicas y estables: `custodias/<empresa>/<viaje>/fotos/<uuid>.jpg`.
 */
@Injectable()
export class CustodiaArchivosService {
  private readonly logger = new Logger(CustodiaArchivosService.name);
  private tokenNube: { valor: string; hasta: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleAuthService,
  ) {}

  private bucket(): string | null {
    return (process.env.CUSTODIAS_FOTOS_BUCKET ?? '').trim() || null;
  }

  almacenamiento(): 'NUBE' | 'BASE_LOCAL' {
    return this.bucket() ? 'NUBE' : 'BASE_LOCAL';
  }

  private exigirClave(clave: string) {
    if (!CLAVE_RE.test(clave)) throw new Error('Clave de archivo no válida.');
  }

  private rutaLocal(clave: string): string {
    return path.join(RAIZ_LOCAL, clave.replace(/^custodias\//, ''));
  }

  private async tokenDeNube(): Promise<string> {
    const ahora = Date.now();
    if (this.tokenNube && this.tokenNube.hasta > ahora) return this.tokenNube.valor;
    const valor = await this.google.getAccessToken([ALCANCE_STORAGE]);
    // Los tokens de Google duran una hora; se renueva antes.
    this.tokenNube = { valor, hasta: ahora + 45 * 60_000 };
    return valor;
  }

  async guardar(clave: string, buffer: Buffer, contentType: string): Promise<void> {
    this.exigirClave(clave);
    const bucket = this.bucket();
    if (!bucket) {
      await saveStoredFile(this.prisma, clave, this.rutaLocal(clave), buffer, contentType);
      return;
    }
    const token = await this.tokenDeNube();
    await axios.post(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`,
      buffer,
      {
        params: { uploadType: 'media', name: clave },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
        maxBodyLength: Infinity,
        timeout: 30_000,
      },
    );
  }

  /** null = no existe. */
  async leer(clave: string, contentType = 'application/octet-stream'): Promise<Buffer | null> {
    this.exigirClave(clave);
    const bucket = this.bucket();
    if (!bucket) return readStoredFile(this.prisma, clave, this.rutaLocal(clave), contentType);
    const token = await this.tokenDeNube();
    try {
      const r = await axios.get<ArrayBuffer>(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(clave)}`,
        {
          params: { alt: 'media' },
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'arraybuffer',
          timeout: 30_000,
        },
      );
      return Buffer.from(r.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }

  /** Borrar algo que ya no existe no es un error. */
  async borrar(clave: string): Promise<void> {
    this.exigirClave(clave);
    const bucket = this.bucket();
    if (!bucket) {
      await deleteStoredFile(this.prisma, clave, this.rutaLocal(clave));
      return;
    }
    const token = await this.tokenDeNube();
    try {
      await axios.delete(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(clave)}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 },
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return;
      this.logger.warn(`No se pudo borrar ${clave} de la nube: ${(err as Error).message}`);
      throw err;
    }
  }
}
