import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import {
  CreateTrainingDto,
  UpdateTrainingDto,
  AddTrainingAttachmentDto,
} from '../dto/training.dto';
import * as path from 'path';

const DRIVE_FOLDER_TYPE = 'CAPACITACIONES';
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'];

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

  // Sube un adjunto (documento del plan, o evidencia de que se realizó) a la
  // carpeta de Drive configurada para Capacitaciones — nunca a disco local.
  async uploadFile(companyId: number, file: Express.Multer.File): Promise<{ url: string }> {
    const config = await this.requireFolder(companyId);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${ext || 'sin extensión'}). Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    const { url } = await this.driveService.uploadFile(
      config.driveFolderId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return { url };
  }

  async findAll(companyId: number) {
    return this.prisma.training.findMany({
      where: { companyId },
      include: { attachments: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateTrainingDto, companyId: number, userId: number) {
    await this.requireFolder(companyId);
    return this.prisma.training.create({
      data: {
        name: dto.name,
        type: dto.type || 'OTRO',
        description: dto.description || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        isAnnualPlan: dto.isAnnualPlan ?? false,
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

    return this.prisma.training.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type || 'OTRO' } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.isAnnualPlan !== undefined ? { isAnnualPlan: dto.isAnnualPlan } : {}),
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
