import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { extractDriveFolderId } from '../../../common/utils/drive-link.util';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];

@Injectable()
export class SistemasDriveService {
  private readonly logger = new Logger(SistemasDriveService.name);
  private driveClient: any = null;

  constructor(private readonly prisma: PrismaService) {}

  private getDriveClient() {
    if (this.driveClient) return this.driveClient;

    const candidates = [
      path.join(process.cwd(), 'google-service-account.json'),
      path.join(__dirname, '..', '..', '..', '..', 'google-service-account.json'),
    ];

    let keyFile: any = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        keyFile = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        break;
      }
    }

    if (!keyFile && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      keyFile = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }

    if (!keyFile) {
      throw new BadRequestException(
        'Google Drive no está configurado. Coloca google-service-account.json o define GOOGLE_SERVICE_ACCOUNT_JSON.',
      );
    }

    // La carpeta configurada para adjuntos de Sistemas debe vivir dentro de
    // una Unidad compartida (Shared Drive) — una cuenta de servicio no tiene
    // cuota propia y no puede crear archivos en una carpeta normal de "Mi
    // unidad", sin importar los permisos que se le den ahí (ver
    // https://developers.google.com/workspace/drive/api/guides/about-shareddrives).
    // Se evaluó domain-wide delegation (impersonar a un usuario real, mismo
    // mecanismo que GmailMailService) como alternativa, pero se descartó:
    // no se puede limitar a un solo usuario, así que habría dejado a la
    // cuenta de servicio con acceso de lectura/escritura total al Drive de
    // cualquier persona del dominio con solo cambiar el `subject`.
    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.driveClient = google.drive({ version: 'v3', auth });
    return this.driveClient;
  }

  async getDriveConfig(companyId: number) {
    if (!companyId) return null;
    return this.prisma.sistemasDriveConfig.findUnique({
      where: { companyId },
    });
  }

  async saveDriveConfig(companyId: number, driveFolderId: string) {
    if (!companyId) {
      throw new BadRequestException(
        'Elige la empresa a la que pertenece esta carpeta de capturas.',
      );
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new BadRequestException('Empresa no encontrada.');
    }
    const sanitized = extractDriveFolderId(driveFolderId);
    // Igual que en DriveService.saveConfig: se guarda el ID (para las
    // llamadas a Drive) y aparte el texto tal como lo pegó la persona, para
    // mostrárselo igual la próxima vez.
    const rawLink = driveFolderId?.trim() || null;
    return this.prisma.sistemasDriveConfig.upsert({
      where: { companyId },
      update: { driveFolderId: sanitized, driveFolderLink: rawLink },
      create: { companyId, driveFolderId: sanitized, driveFolderLink: rawLink },
    });
  }

  async testConnection(driveFolderId: string) {
    try {
      const drive = this.getDriveClient();
      const res = await drive.files.get({
        fileId: extractDriveFolderId(driveFolderId),
        fields: 'id, name, mimeType',
        supportsAllDrives: true,
      });
      return {
        success: true,
        message: `Conexión exitosa con la carpeta "${res.data.name}"`,
        folderName: res.data.name,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error al conectar: ${err.message}`,
      };
    }
  }

  async uploadFile(companyId: number, file: Express.Multer.File): Promise<{ url: string; nombre: string }> {
    const config = await this.prisma.sistemasDriveConfig.findUnique({
      where: { companyId },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de Drive configurada para Sistemas. Configúrala desde Soporte Técnico.',
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${ext || 'sin extensión'}). Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const drive = this.getDriveClient();
    const sanitizedFolderId = extractDriveFolderId(config.driveFolderId);
    const res = await drive.files.create({
      requestBody: { name: file.originalname, parents: [sanitizedFolderId] },
      media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });

    const id = res.data.id as string;
    const url = `https://drive.google.com/file/d/${id}/view`;
    this.logger.log(`Archivo subido a Drive: ${file.originalname} → ${url}`);
    return { url, nombre: file.originalname };
  }
}
