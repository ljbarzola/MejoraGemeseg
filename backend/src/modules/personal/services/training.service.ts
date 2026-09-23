import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import {
  CreateTrainingDto,
  UpdateTrainingDto,
  AddTrainingAttachmentDto,
} from '../dto/training.dto';
import * as path from 'path';

const DRIVE_FOLDER_TYPE = 'CAPACITACIONES';
const CARPETA_ANUAL = 'Anual';
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'];

type DecisionCarpeta = {
  folderAction?: 'usar_existente' | 'nuevo_nombre';
  folderName?: string;
};

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
  ) {}

  private async requireFolder(companyId: number) {
    const config = await this.driveService.getConfig(companyId, DRIVE_FOLDER_TYPE);
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de Drive de Capacitaciones definida en el sistema.',
      );
    }
    return config;
  }

  // Sube un adjunto a la carpeta de ESA capacitación. Si todavía no tiene
  // carpeta, la crea (o pregunta, vía 409, si el nombre ya existe). Sin
  // trainingId se deja en la raíz: solo lo usa un cliente viejo.
  async uploadFile(
    companyId: number,
    file: Express.Multer.File,
    destino?: { trainingId?: number } & DecisionCarpeta,
  ): Promise<{ url: string }> {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${ext || 'sin extensión'}). Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    let folderId: string;
    if (destino?.trainingId) {
      const training = await this.prisma.training.findFirst({
        where: { id: destino.trainingId, companyId },
      });
      if (!training) throw new NotFoundException('Capacitación no encontrada');
      const ubicada = training.driveFolderId
        || await this.ubicarCarpeta(companyId, training.name, training.isAnnualPlan, destino, null);
      if (!ubicada) {
        throw new BadRequestException(
          'No hay carpeta de Drive de Capacitaciones definida en el sistema.',
        );
      }
      folderId = ubicada;
      if (!training.driveFolderId) {
        await this.prisma.training.update({
          where: { id: training.id },
          data: { driveFolderId: folderId },
        });
      }
    } else {
      folderId = (await this.requireFolder(companyId)).driveFolderId;
    }

    const { url } = await this.driveService.uploadFile(
      folderId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return { url };
  }

  // Carpeta de la capacitación. Si es del plan anual, vive dentro de "Anual"
  // (esa carpeta se crea si no está, sin preguntar). Si no, vive directo en
  // Capacitaciones. El nombre de la capacitación sí se revisa: si ya hay una
  // carpeta igual, 409 para que la pantalla pregunte.
  private async ubicarCarpeta(
    companyId: number,
    trainingName: string,
    isAnnualPlan: boolean,
    decision: DecisionCarpeta,
    currentFolderId: string | null,
  ): Promise<string | null> {
    const config = await this.driveService.getConfig(companyId, DRIVE_FOLDER_TYPE);
    if (!config?.driveFolderId) return null;

    let parentId = config.driveFolderId;
    if (isAnnualPlan) {
      const anual = await this.driveService.findChildFolderByName(parentId, CARPETA_ANUAL);
      parentId = anual?.id ?? await this.driveService.createSubfolder(parentId, CARPETA_ANUAL);
    }

    const desired = (decision.folderAction === 'nuevo_nombre' ? decision.folderName : trainingName)
      ?.trim()
      .replace(/\s+/g, ' ');
    if (!desired) throw new BadRequestException('El nombre de la carpeta no puede estar vacío.');

    const existing = await this.driveService.findChildFolderByName(parentId, desired);
    if (existing && existing.id !== currentFolderId) {
      if (decision.folderAction === 'usar_existente') {
        if (currentFolderId) {
          await this.driveService.moveFolderContents(currentFolderId, existing.id);
        }
        return existing.id;
      }
      throw new ConflictException({
        statusCode: 409,
        message: `Ya existe una carpeta llamada "${existing.name}".`,
        code: 'CARPETA_EXISTE',
        folderId: existing.id,
        folderName: existing.name,
        ubicacion: isAnnualPlan ? 'Anual' : 'Capacitaciones',
      });
    }

    if (currentFolderId) {
      try {
        await this.driveService.relocateFolder(currentFolderId, parentId, desired);
        return currentFolderId;
      } catch (err) {
        const code = (err as { code?: number; response?: { status?: number } }).code
          ?? (err as { response?: { status?: number } }).response?.status;
        if (code !== 404) throw err;
      }
    }

    return this.driveService.createSubfolder(parentId, desired);
  }

  async findAll(companyId: number) {
    return this.prisma.training.findMany({
      where: { companyId },
      include: { attachments: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateTrainingDto, companyId: number, userId: number) {
    const name = decisionNombre(dto.name, dto);
    const isAnnualPlan = dto.isAnnualPlan ?? false;
    // Sin carpeta raíz configurada el registro igual se guarda (fecha y
    // enlaces). Con carpeta, se crea la subcarpeta ahora, aunque todavía
    // no haya archivos.
    const driveFolderId = await this.ubicarCarpeta(companyId, name, isAnnualPlan, dto, null);
    return this.prisma.training.create({
      data: {
        name,
        type: dto.type || 'OTRO',
        description: dto.description || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        isAnnualPlan,
        driveFolderId,
        companyId,
        createdBy: userId,
      },
      include: { attachments: true },
    });
  }

  async update(id: number, dto: UpdateTrainingDto, companyId: number) {
    const training = await this.prisma.training.findFirst({
      where: { id, companyId },
    });
    if (!training) throw new NotFoundException('Capacitación no encontrada');

    const name = decisionNombre(dto.name ?? training.name, dto);
    const isAnnualPlan = dto.isAnnualPlan ?? training.isAnnualPlan;
    const nombreCambio = name !== training.name;
    const anualCambio = isAnnualPlan !== training.isAnnualPlan;
    const driveFolderId = (nombreCambio || anualCambio || !training.driveFolderId || dto.folderAction)
      ? await this.ubicarCarpeta(companyId, name, isAnnualPlan, dto, training.driveFolderId)
      : training.driveFolderId;

    return this.prisma.training.update({
      where: { id },
      data: {
        ...(dto.name !== undefined || dto.folderAction === 'nuevo_nombre' ? { name } : {}),
        ...(dto.type !== undefined ? { type: dto.type || 'OTRO' } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.isAnnualPlan !== undefined ? { isAnnualPlan } : {}),
        ...(driveFolderId ? { driveFolderId } : {}),
      },
      include: { attachments: true },
    });
  }

  async delete(id: number, companyId: number) {
    const training = await this.prisma.training.findFirst({
      where: { id, companyId },
    });
    if (!training) throw new NotFoundException('Capacitación no encontrada');
    return this.prisma.training.delete({ where: { id } });
  }

  // Agrega UN adjunto (archivo ya subido a Drive, o enlace) — se puede
  // llamar varias veces para dejar varios archivos y varios enlaces en la
  // misma capacitación.
  async addAttachment(id: number, dto: AddTrainingAttachmentDto, companyId: number) {
    const training = await this.prisma.training.findFirst({ where: { id, companyId } });
    if (!training) throw new NotFoundException('Capacitación no encontrada');

    return this.prisma.trainingAttachment.create({
      data: {
        trainingId: id,
        url: dto.url,
        name: dto.name || null,
        kind: dto.kind || 'DOCUMENTO',
      },
    });
  }

  async removeAttachment(id: number, attachmentId: number, companyId: number) {
    const training = await this.prisma.training.findFirst({ where: { id, companyId } });
    if (!training) throw new NotFoundException('Capacitación no encontrada');

    const attachment = await this.prisma.trainingAttachment.findFirst({
      where: { id: attachmentId, trainingId: id },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');
    return this.prisma.trainingAttachment.delete({ where: { id: attachmentId } });
  }

  // Cumplimiento general, no por guardia: se marca una sola vez. Volver a
  // llamarlo simplemente actualiza quién/cuándo la verificó por última vez
  // (no crea registros duplicados, no hay nada que "duplicar").
  async setCompleted(id: number, completed: boolean, companyId: number, userId: number) {
    const training = await this.prisma.training.findFirst({ where: { id, companyId } });
    if (!training) throw new NotFoundException('Capacitación no encontrada');

    return this.prisma.training.update({
      where: { id },
      data: completed
        ? { completed: true, completedAt: new Date(), completedBy: userId }
        : { completed: false, completedAt: null, completedBy: null },
      include: { attachments: true },
    });
  }
}

function decisionNombre(nombre: string, decision: DecisionCarpeta): string {
  if (decision.folderAction === 'nuevo_nombre' && decision.folderName?.trim()) {
    return decision.folderName.trim().replace(/\s+/g, ' ');
  }
  return nombre.trim().replace(/\s+/g, ' ');
}
