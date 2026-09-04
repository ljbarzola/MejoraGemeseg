import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private driveClient: any = null;

  constructor(private readonly prisma: PrismaService) {}

  private getDriveClient() {
    if (this.driveClient) return this.driveClient;

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      this.driveClient = google.drive({ version: 'v3', auth });
      return this.driveClient;
    }

    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) {
      const keyPath = path.join(process.cwd(), 'google-service-account.json');
      if (fs.existsSync(keyPath)) {
        const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
        const auth = new google.auth.GoogleAuth({
          credentials: keyFile,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
        this.driveClient = google.drive({ version: 'v3', auth });
        return this.driveClient;
      }
      throw new BadRequestException(
        'Google Drive no configurado. Configura GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_SERVICE_ACCOUNT_JSON.',
      );
    }

    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    this.driveClient = google.drive({ version: 'v3', auth });
    return this.driveClient;
  }

  async testConnection(companyId: number, folderId?: string) {
    if (!companyId) return { success: false, message: 'Usuario sin empresa asociada. Inicia sesión nuevamente.' };
    try {
      const drive = this.getDriveClient();
      let targetFolderId = folderId?.trim();
      if (!targetFolderId) {
        const config = await this.prisma.folderConfig.findFirst({ where: { companyId } });
        if (!config) {
          return { success: false, message: 'Escribe el ID de la carpeta raíz y pulsa Probar Conexión.' };
        }
        targetFolderId = config.driveFolderId;
      }
      const folder = await drive.files.get({
        fileId: targetFolderId,
        fields: 'id, name',
        supportsAllDrives: true,
      });
      return { success: true, folderName: folder.data.name, folderId: folder.data.id };
    } catch (error) {
      this.logger.error(`Error de conexión: ${error.message}`);
      return { success: false, message: `No se pudo conectar a Google Drive: ${error.message}. Verifica el ID de la carpeta y las credenciales.` };
    }
  }

  async getConfig(companyId: number) {
    if (!companyId) return null;
    return this.prisma.folderConfig.findFirst({ where: { companyId } });
  }

  async saveConfig(companyId: number, driveFolderId: string, driveFolderName: string) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const existing = await this.prisma.folderConfig.findFirst({ where: { companyId } });
    if (existing) {
      return this.prisma.folderConfig.update({
        where: { id: existing.id },
        data: { driveFolderId, driveFolderName },
      });
    }
    return this.prisma.folderConfig.create({
      data: { driveFolderId, driveFolderName, companyId },
    });
  }

  async syncFolder(companyId: number, userId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const drive = this.getDriveClient();
    const config = await this.prisma.folderConfig.findFirst({ where: { companyId } });
    if (!config) {
      throw new BadRequestException('No hay carpeta configurada. Guarda el ID de la carpeta raíz primero.');
    }

    const result = { custodias: 0, personal: 0, employees: 0, documents: 0, errors: [] as string[] };

    try {
      const subFolders = await this.listSubFolders(config.driveFolderId);

      for (const subFolder of subFolders) {
        const subName = subFolder.name.toLowerCase();
        const folderType = subName.includes('custod') ? 'CUSTODIAS' : 'PERSONAL';

        const employeeFolders = await this.listSubFolders(subFolder.id);

        for (const empFolder of employeeFolders) {
          try {
            const parsed = this.parseEmployeeFolderName(empFolder.name, empFolder.id);

            let candidate = await this.prisma.candidate.findFirst({
              where: { companyId, cedula: parsed.cedula },
            });

            if (!candidate) {
              const columns = await this.prisma.kanbanColumn.findMany({
                where: { companyId },
                orderBy: { position: 'asc' },
              });
              const firstCol = columns[0];

              candidate = await this.prisma.candidate.create({
                data: {
                  fullName: parsed.name,
                  cedula: parsed.cedula,
                  positionApplied: folderType === 'CUSTODIAS' ? 'Custodio' : 'Personal Administrativo',
                  columnId: firstCol?.id || null,
                  companyId,
                  createdBy: userId,
                },
              });
              result.employees++;
            } else if (candidate.positionApplied !== (folderType === 'CUSTODIAS' ? 'Custodio' : 'Personal Administrativo')) {
              await this.prisma.candidate.update({
                where: { id: candidate.id },
                data: {
                  positionApplied: folderType === 'CUSTODIAS' ? 'Custodio' : 'Personal Administrativo',
                },
              });
            }

            await this.prisma.employeeDriveFolder.upsert({
              where: { companyId_cedula: { companyId, cedula: parsed.cedula } },
              create: {
                employeeName: parsed.name,
                cedula: parsed.cedula,
                folderId: empFolder.id,
                folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
                folderType,
                lastSyncAt: new Date(),
                companyId,
              },
              update: {
                employeeName: parsed.name,
                folderId: empFolder.id,
                folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
                folderType,
                lastSyncAt: new Date(),
              },
            });

            const files = await this.listFilesInFolder(empFolder.id);
            for (const file of files) {
              await this.prisma.employeeDocument.upsert({
                where: { driveFileId: file.id },
                create: {
                  employeeName: parsed.name,
                  cedula: parsed.cedula,
                  fileName: file.name,
                  fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
                  fileType: file.mimeType,
                  driveFileId: file.id,
                  folder: folderType,
                  companyId,
                },
                update: {
                  employeeName: parsed.name,
                  cedula: parsed.cedula,
                  fileName: file.name,
                  folder: folderType,
                  companyId,
                },
              });
              result.documents++;
            }

            if (folderType === 'CUSTODIAS') result.custodias++;
            else result.personal++;
          } catch (empErr: any) {
            this.logger.error(`Error procesando carpeta ${empFolder.name}: ${empErr.message}`);
            result.errors.push(`Error en ${empFolder.name}: ${empErr.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error en sincronización: ${error.message}`);
      result.errors.push(error.message);
    }

    return result;
  }

  async getCompliance(cedula: string, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const driveFolder = await this.prisma.employeeDriveFolder.findFirst({
      where: { companyId, cedula },
    });

    if (!driveFolder) {
      throw new BadRequestException(`No se encontró carpeta de Drive para cédula ${cedula}`);
    }

    const folderType = driveFolder.folderType;
    const docTypes = await this.prisma.documentType.findMany({
      where: { companyId, folder: folderType },
      orderBy: { name: 'asc' },
    });

    const employeeDocs = await this.prisma.employeeDocument.findMany({
      where: { companyId, cedula, folder: folderType },
    });

    const candidate = await this.prisma.candidate.findFirst({
      where: { companyId, cedula },
      include: { column: true },
    });
    const column_name = candidate?.column?.name || '';

    const documents = docTypes.map((dt) => {
      const matchResult = this.findMatchingDoc(employeeDocs, dt.name);
      const isContrato = dt.name.toLowerCase().includes('contrato');
      const isActivo = column_name === 'Activo' || column_name === 'Contratado';

      let required = dt.required;
      if (isContrato && !isActivo) {
        required = false;
      }

      return {
        type: dt.name,
        required,
        status: matchResult ? 'present' : 'missing',
        fileName: matchResult?.fileName || null,
        fileUrl: matchResult?.fileUrl || null,
        uploadedAt: matchResult?.createdAt || null,
      };
    });

    const requiredCount = documents.filter((d) => d.required).length;
    const presentCount = documents.filter((d) => d.required && d.status === 'present').length;
    const compliancePercent = requiredCount > 0 ? Math.round((presentCount / requiredCount) * 100) : 0;

    const matchedFileNames = new Set(
      documents.filter((d) => d.status === 'present').map((d: any) => d.fileName?.toLowerCase()),
    );
    const unmatchedFiles = employeeDocs
      .filter((doc) => !matchedFileNames.has(doc.fileName.toLowerCase()))
      .map((doc) => ({
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        uploadedAt: doc.createdAt,
      }));

    return {
      employee: driveFolder.employeeName,
      cedula,
      folder: folderType,
      stage: column_name,
      documents,
      compliancePercent,
      unmatchedFiles,
      lastSyncAt: driveFolder.lastSyncAt,
    };
  }

  private normalizeStr(s: string): string {
    return s.normalize('NFC').toLowerCase().replace(/\.[^/.]+$/, '').trim();
  }

  private removeAccents(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private findMatchingDoc(docs: any[], docTypeName: string): any {
    const normalizedType = this.normalizeStr(docTypeName);
    const accentlessType = this.removeAccents(normalizedType);
    const searchTerms = normalizedType.split(/\s+/).filter((w) => w.length > 2);
    const accentlessTerms = accentlessType.split(/\s+/).filter((w) => w.length > 2);

    return docs.find((d) => {
      const fileName = this.normalizeStr(d.fileName);
      const accentlessFile = this.removeAccents(fileName);

      if (fileName.includes(normalizedType) || accentlessFile.includes(accentlessType)) return true;

      const allTerms = [...new Set([...searchTerms, ...accentlessTerms])];
      return allTerms.some((term) => fileName.includes(term) || accentlessFile.includes(term));
    });
  }

  async getTree(companyId: number) {
    if (!companyId) return { CUSTODIAS: [], PERSONAL: [] };
    const folders = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId },
      orderBy: [{ folderType: 'asc' }, { employeeName: 'asc' }],
    });

    const tree: Record<string, any[]> = { CUSTODIAS: [], PERSONAL: [] };
    for (const f of folders) {
      const docs = await this.prisma.employeeDocument.findMany({
        where: { companyId, cedula: f.cedula },
      });
      tree[f.folderType]?.push({
        employeeName: f.employeeName,
        cedula: f.cedula,
        folderUrl: f.folderUrl,
        lastSyncAt: f.lastSyncAt,
        documentCount: docs.length,
      });
    }

    return tree;
  }

  async getDocumentTypes(companyId: number) {
    if (!companyId) return [];
    return this.prisma.documentType.findMany({
      where: { companyId },
      orderBy: [{ folder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDocumentType(data: { name: string; folder: string; required?: boolean }, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.documentType.create({
      data: { name: data.name, folder: data.folder, required: data.required ?? true, companyId },
    });
  }

  async updateDocumentType(id: number, data: { name?: string; required?: boolean }, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const dt = await this.prisma.documentType.findFirst({ where: { id, companyId } });
    if (!dt) throw new BadRequestException('Tipo de documento no encontrado');
    return this.prisma.documentType.update({ where: { id }, data });
  }

  async deleteDocumentType(id: number, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const dt = await this.prisma.documentType.findFirst({ where: { id, companyId } });
    if (!dt) throw new BadRequestException('Tipo de documento no encontrado');
    return this.prisma.documentType.delete({ where: { id } });
  }

  private async listSubFolders(parentId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  }

  private async listFilesInFolder(folderId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  }

  async deleteEmployeeByCedula(cedula: string, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');

    await this.prisma.employeeDocument.deleteMany({
      where: { companyId, cedula },
    });

    await this.prisma.candidate.deleteMany({
      where: { companyId, cedula },
    });

    return this.prisma.employeeDriveFolder.deleteMany({
      where: { companyId, cedula },
    });
  }

  private async getReclutamientoFolderId(companyId: number): Promise<string> {
    const drive = this.getDriveClient();
    const config = await this.prisma.folderConfig.findFirst({ where: { companyId } });
    if (!config) {
      throw new BadRequestException('No hay carpeta configurada en Drive. Guarda la carpeta raíz de Recursos Humanos primero.');
    }

    const subFolders = await this.listSubFolders(config.driveFolderId);
    const recFolder = subFolders.find((f: any) => f.name.toLowerCase().includes('reclutamiento'));

    if (recFolder) return recFolder.id;

    // Create 'Reclutamiento' subfolder if it doesn't exist
    const created = await drive.files.create({
      requestBody: {
        name: 'Reclutamiento',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [config.driveFolderId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    return created.data.id;
  }

  async getJobPositions(companyId: number) {
    if (!companyId) return [];
    return this.prisma.jobPosition.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJobPosition(
    dto: { puesto: string; descripcion?: string; camposRequeridos?: string[]; archivosRequeridos?: string[] },
    companyId: number
  ) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    if (!dto.puesto?.trim()) throw new BadRequestException('El nombre del puesto es obligatorio.');

    const position = await this.prisma.jobPosition.create({
      data: {
        puesto: dto.puesto.trim(),
        descripcion: dto.descripcion?.trim() || null,
        camposRequeridos: dto.camposRequeridos || [],
        archivosRequeridos: dto.archivosRequeridos || [],
        companyId,
      },
    });

    // Save JSON file in Google Drive Reclutamiento folder
    try {
      const drive = this.getDriveClient();
      const recFolderId = await this.getReclutamientoFolderId(companyId);

      const jsonPayload = JSON.stringify(
        {
          id: position.id,
          puesto: position.puesto,
          descripcion: position.descripcion || '',
          camposRequeridos: position.camposRequeridos || [],
          archivosRequeridos: position.archivosRequeridos || [],
          createdAt: position.createdAt,
        },
        null,
        2
      );

      const fileName = `Puesto_${position.puesto.replace(/[^a-zA-Z0-9\-_]/g, '_')}.json`;
      const fileMetadata = {
        name: fileName,
        parents: [recFolderId],
        mimeType: 'application/json',
      };
      const media = {
        mimeType: 'application/json',
        body: jsonPayload,
      };

      const driveFile = await drive.files.create({
        requestBody: fileMetadata,
        media: { mimeType: 'application/json', body: jsonPayload },
        fields: 'id',
        supportsAllDrives: true,
      });

      if (driveFile.data?.id) {
        await this.prisma.jobPosition.update({
          where: { id: position.id },
          data: { driveFileId: driveFile.data.id },
        });
      }
    } catch (err) {
      this.logger.error(`Error guardando JSON del puesto en Drive: ${err.message}`);
    }

    return position;
  }

  async updateJobPosition(
    id: number,
    dto: { puesto?: string; descripcion?: string; camposRequeridos?: string[]; archivosRequeridos?: string[] },
    companyId: number
  ) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const position = await this.prisma.jobPosition.findFirst({ where: { id, companyId } });
    if (!position) throw new BadRequestException('Puesto no encontrado.');

    const updateData: any = {};
    if (dto.puesto !== undefined) updateData.puesto = dto.puesto.trim();
    if (dto.descripcion !== undefined) updateData.descripcion = dto.descripcion?.trim() || null;
    if (dto.camposRequeridos !== undefined) updateData.camposRequeridos = dto.camposRequeridos;
    if (dto.archivosRequeridos !== undefined) updateData.archivosRequeridos = dto.archivosRequeridos;

    const updated = await this.prisma.jobPosition.update({
      where: { id },
      data: updateData,
    });

    // Update JSON file in Google Drive if it exists
    if (position.driveFileId) {
      try {
        const drive = this.getDriveClient();
        const jsonPayload = JSON.stringify(
          {
            id: updated.id,
            puesto: updated.puesto,
            descripcion: updated.descripcion || '',
            camposRequeridos: updated.camposRequeridos || [],
            archivosRequeridos: updated.archivosRequeridos || [],
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
          null,
          2
        );
        await drive.files.update({
          fileId: position.driveFileId,
          media: { mimeType: 'application/json', body: jsonPayload },
          supportsAllDrives: true,
        });
      } catch (err) {
        this.logger.warn(`No se pudo actualizar el archivo JSON en Drive: ${err.message}`);
      }
    }

    return updated;
  }

  async deleteJobPosition(id: number, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    const position = await this.prisma.jobPosition.findFirst({ where: { id, companyId } });
    if (!position) throw new BadRequestException('Puesto no encontrado.');

    if (position.driveFileId) {
      try {
        const drive = this.getDriveClient();
        await drive.files.delete({ fileId: position.driveFileId, supportsAllDrives: true });
      } catch (err) {
        this.logger.warn(`No se pudo eliminar el archivo JSON de Drive: ${err.message}`);
      }
    }

    return this.prisma.jobPosition.delete({ where: { id } });
  }

  async syncReclutamientoCandidates(companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');

    const config = await this.prisma.folderConfig.findFirst({ where: { companyId } });
    if (!config) {
      return {
        puestosCount: 0,
        candidatosCount: 0,
        candidatos: [],
        warning: 'No hay carpeta de Drive configurada. Configura la carpeta raíz de Recursos Humanos primero.',
      };
    }

    let recFolderId: string;
    try {
      recFolderId = await this.getReclutamientoFolderId(companyId);
    } catch (err) {
      return {
        puestosCount: 0,
        candidatosCount: 0,
        candidatos: [],
        warning: `No se pudo acceder a la carpeta de Reclutamiento: ${err.message}`,
      };
    }

    const jobPositions = await this.getJobPositions(companyId);

    let subFolders: any[] = [];
    try {
      subFolders = await this.listSubFolders(recFolderId);
    } catch (err) {
      this.logger.warn(`Error listando subcarpetas de Reclutamiento: ${err.message}`);
    }

    const drive = this.getDriveClient();
    const candidateList: any[] = [];

    for (const folder of subFolders) {
      try {
        const parsed = this.parseEmployeeFolderName(folder.name, folder.id);
        const files = await this.listFilesInFolder(folder.id);

        let candidatoJsonData: any = null;
        const jsonFile = files.find((f: any) => f.name.toLowerCase().endsWith('.json'));

        if (jsonFile) {
          try {
            const fileRes = await drive.files.get(
              { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
              { responseType: 'text' }
            );
            candidatoJsonData = typeof fileRes.data === 'string' ? JSON.parse(fileRes.data) : fileRes.data;
          } catch (e) {
            this.logger.warn(`Error leyendo candidato.json en ${folder.name}: ${e.message}`);
          }
        }

        const nombre = candidatoJsonData?.nombreCompleto || candidatoJsonData?.nombre || parsed.name;
        const cedula = candidatoJsonData?.cedula || parsed.cedula;
        const puestoAplicado = candidatoJsonData?.puestoAplicado || candidatoJsonData?.puesto || 'General';

        // Match with job position
        const matchedPosition = jobPositions.find(
          (p) =>
            p.puesto.toLowerCase().trim() === puestoAplicado.toLowerCase().trim() ||
            puestoAplicado.toLowerCase().includes(p.puesto.toLowerCase())
        );

        const archivosRequeridos = matchedPosition?.archivosRequeridos || [];
        let archivosPresentesCount = 0;

        if (archivosRequeridos.length > 0) {
          for (const reqDoc of archivosRequeridos) {
            if (this.findMatchingDoc(files, reqDoc)) {
              archivosPresentesCount++;
            }
          }
        } else {
          archivosPresentesCount = files.length;
        }

        const completitudPercent = archivosRequeridos.length > 0
          ? Math.min(100, Math.round((archivosPresentesCount / archivosRequeridos.length) * 100))
          : files.length > 0 ? 100 : 0;

        candidateList.push({
          id: folder.id,
          nombre,
          cedula,
          puestoAplicado,
          completitudPercent,
          archivosSubidosCount: files.length,
          archivosRequeridosCount: archivosRequeridos.length,
          archivosRequeridos,
          archivosSubidosList: files.map((f: any) => ({ id: f.id, name: f.name })),
          folderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
          datosFormulario: candidatoJsonData?.datosFormulario || candidatoJsonData || {},
          telefono: candidatoJsonData?.telefono || '',
          email: candidatoJsonData?.email || '',
        });
      } catch (err) {
        this.logger.error(`Error procesando carpeta candidato ${folder.name}: ${err.message}`);
      }
    }

    return {
      puestosCount: jobPositions.length,
      candidatosCount: candidateList.length,
      candidatos: candidateList.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }

  private parseEmployeeFolderName(folderName: string, folderId?: string): { name: string; cedula: string } {
    const match = folderName.match(/^(.+?)\s*-\s*([A-Za-z0-9]{7,13})$/);
    if (match) {
      return { name: match[1].trim(), cedula: match[2].trim() };
    }
    const cedulaOnly = folderName.match(/^([A-Za-z0-9]{7,13})$/);
    if (cedulaOnly) {
      return { name: cedulaOnly[1], cedula: cedulaOnly[1] };
    }
    const fallbackCedula = folderId ? `ID-${folderId.slice(-10)}` : `TEMP-${Date.now()}`;
    return { name: folderName.trim(), cedula: fallbackCedula };
  }
}
