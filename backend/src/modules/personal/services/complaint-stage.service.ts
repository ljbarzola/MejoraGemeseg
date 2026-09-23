import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateComplaintStageInput {
  key: string;
  label: string;
  color?: string;
  order?: number;
  isInitial?: boolean;
  isFinal?: boolean;
}

export interface UpdateComplaintStageInput {
  label?: string;
  color?: string;
  order?: number;
  isInitial?: boolean;
  isFinal?: boolean;
}

const MAX_BLOCKING_COMPLAINTS_LISTED = 20;

// Etapas editables del proceso de "Gestión de Quejas y Sugerencias" (Fase 5:
// reemplaza el enum fijo ComplaintStatus). Mismo patrón de scoping por
// companyId que ComplaintFieldDefinitionService, con reglas extra de
// integridad porque `key` es el valor que se persiste en vivo en
// Complaint.status (ver comentario en schema.prisma).
@Injectable()
export class ComplaintStageService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.complaintStage.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
  }

  async create(companyId: number, data: CreateComplaintStageInput) {
    const existing = await this.prisma.complaintStage.findFirst({
      where: { companyId, key: data.key },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una etapa con la clave "${data.key}"`,
      );
    }

    const count = await this.prisma.complaintStage.count({
      where: { companyId },
    });

    // Si esta va a ser la etapa inicial, desmarca la anterior en la misma
    // transacción — solo puede haber una etapa inicial por empresa.
    if (data.isInitial) {
      return this.prisma.$transaction(async (tx) => {
        await tx.complaintStage.updateMany({
          where: { companyId, isInitial: true },
          data: { isInitial: false },
        });
        return tx.complaintStage.create({
          data: {
            companyId,
            key: data.key,
            label: data.label.trim(),
            color: data.color || '#718096',
            order: data.order ?? count,
            isInitial: true,
            isFinal: data.isFinal ?? false,
          },
        });
      });
    }

    return this.prisma.complaintStage.create({
      data: {
        companyId,
        key: data.key,
        label: data.label.trim(),
        color: data.color || '#718096',
        order: data.order ?? count,
        isInitial: false,
        isFinal: data.isFinal ?? false,
      },
    });
  }

  async update(id: number, companyId: number, data: UpdateComplaintStageInput) {
    const stage = await this.prisma.complaintStage.findFirst({
      where: { id, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa no encontrada');

    // Marcar esta como inicial desmarca automáticamente la que lo era antes
    // — solo una etapa inicial por empresa en todo momento. isFinal es
    // puramente informativo (puede haber más de una etapa final), no se
    // fuerza unicidad ahí.
    if (data.isInitial) {
      return this.prisma.$transaction(async (tx) => {
        await tx.complaintStage.updateMany({
          where: { companyId, isInitial: true, id: { not: id } },
          data: { isInitial: false },
        });
        return tx.complaintStage.update({
          where: { id },
          data: {
            ...(data.label !== undefined ? { label: data.label.trim() } : {}),
            ...(data.color !== undefined ? { color: data.color } : {}),
            ...(data.order !== undefined ? { order: data.order } : {}),
            ...(data.isFinal !== undefined ? { isFinal: data.isFinal } : {}),
            isInitial: true,
          },
        });
      });
    }

    return this.prisma.complaintStage.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label.trim() } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
        ...(data.isInitial !== undefined ? { isInitial: data.isInitial } : {}),
        ...(data.isFinal !== undefined ? { isFinal: data.isFinal } : {}),
      },
    });
  }

  async delete(id: number, companyId: number) {
    const stage = await this.prisma.complaintStage.findFirst({
      where: { id, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa no encontrada');

    const otras = await this.prisma.complaintStage.count({
      where: { companyId, id: { not: id } },
    });
    // Si hay otras etapas, la inicial no se borra hasta marcar otra: si no,
    // una queja nueva no sabría en qué columna nacer. Si esta es la única,
    // el tablero puede volver a quedar vacío.
    if (stage.isInitial && otras > 0) {
      throw new BadRequestException(
        'No se puede eliminar la etapa inicial. Marca otra etapa como inicial antes de eliminar esta.',
      );
    }

    // No se auto-reasignan ni se pisa la referencia: si hay quejas en esta
    // etapa y existen otras columnas, el borrado queda bloqueado y se listan
    // hasta 20 para que RRHH las mueva. Si es la única etapa, las quejas se
    // van con ella: si no, el tablero no puede volver a cero.
    const blockingCount = await this.prisma.complaint.count({
      where: { companyId, status: stage.key },
    });
    if (blockingCount > 0 && otras === 0) {
      await this.prisma.complaint.deleteMany({
        where: { companyId, status: stage.key },
      });
    } else if (blockingCount > 0) {
      const blocking = await this.prisma.complaint.findMany({
        where: { companyId, status: stage.key },
        take: MAX_BLOCKING_COMPLAINTS_LISTED,
        orderBy: { createdAt: 'desc' },
        select: { id: true, description: true },
      });
      const items = blocking.map(
        (c) =>
          `#${c.id} — ${c.description.slice(0, 60)}${c.description.length > 60 ? '…' : ''}`,
      );
      const extra = blockingCount - blocking.length;
      const suffix = extra > 0 ? ` y ${extra} más` : '';
      throw new BadRequestException(
        `No se puede eliminar la etapa "${stage.label}": hay ${blockingCount} queja(s) en ella. ` +
          `Muévelas a otra etapa antes de eliminarla: ${items.join('; ')}${suffix}.`,
      );
    }

    return this.prisma.complaintStage.delete({ where: { id } });
  }
}
