import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  // Reglas de integridad del pipeline, mismo chequeo que
  // VentasClientesService.validarIntegridadEtapas: una etapa no puede ser
  // inicial y final a la vez, y la inicial nunca puede quedar en el mismo
  // lugar o después de una final. Corre DENTRO de la transacción que hizo
  // el cambio: si algo no cuadra, lanza y el `$transaction` revierte todo.
  private async validarIntegridadEtapas(
    tx: Prisma.TransactionClient,
    companyId: number,
  ) {
    const stages = await tx.complaintStage.findMany({ where: { companyId } });
    if (stages.length === 0) return;

    const iniciales = stages.filter((s) => s.isInitial);
    const finales = stages.filter((s) => s.isFinal);

    const ambas = iniciales.find((s) => s.isFinal);
    if (ambas) {
      throw new BadRequestException(
        `La etapa "${ambas.label}" no puede ser inicial y final al mismo tiempo.`,
      );
    }

    if (iniciales.length === 0) {
      throw new BadRequestException(
        'Debe existir una etapa inicial. Marca alguna etapa como inicial.',
      );
    }

    if (finales.length > 0) {
      const ordenInicial = iniciales[0].order;
      const ordenMinimoFinal = Math.min(...finales.map((s) => s.order));
      if (ordenInicial >= ordenMinimoFinal) {
        throw new BadRequestException(
          'La etapa inicial no puede ir después (ni en el mismo lugar) de una etapa final.',
        );
      }
    }
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
    if (data.isInitial && data.isFinal) {
      throw new BadRequestException(
        'Una etapa no puede ser inicial y final al mismo tiempo.',
      );
    }

    const count = await this.prisma.complaintStage.count({
      where: { companyId },
    });

    // La primera etapa de la empresa es siempre la inicial: si no, la
    // validación de integridad la rechazaría (0 iniciales) y el usuario
    // quedaría sin forma de crear la primera desde el modal.
    const esPrimera = count === 0;
    const isInitial = esPrimera ? true : (data.isInitial ?? false);
    const isFinal = esPrimera ? false : (data.isFinal ?? false);

    // Si esta va a ser la etapa inicial, desmarca la anterior en la misma
    // transacción — solo puede haber una etapa inicial por empresa.
    return this.prisma.$transaction(async (tx) => {
      if (isInitial) {
        await tx.complaintStage.updateMany({
          where: { companyId, isInitial: true },
          data: { isInitial: false },
        });
      }
      const created = await tx.complaintStage.create({
        data: {
          companyId,
          key: data.key,
          label: data.label.trim(),
          color: data.color || '#718096',
          order: data.order ?? count,
          isInitial,
          isFinal,
        },
      });
      await this.validarIntegridadEtapas(tx, companyId);
      return created;
    });
  }

  async update(id: number, companyId: number, data: UpdateComplaintStageInput) {
    const stage = await this.prisma.complaintStage.findFirst({
      where: { id, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa no encontrada');
    if (
      (data.isInitial ?? stage.isInitial) &&
      (data.isFinal ?? stage.isFinal)
    ) {
      throw new BadRequestException(
        'Una etapa no puede ser inicial y final al mismo tiempo.',
      );
    }
    if (data.isInitial === false && stage.isInitial) {
      throw new BadRequestException(
        'No se puede quitar la etapa inicial. Marca otra etapa como inicial en su lugar.',
      );
    }

    // Marcar esta como inicial desmarca automáticamente la que lo era antes
    // — solo una etapa inicial por empresa en todo momento. isFinal es
    // puramente informativo (puede haber más de una etapa final), no se
    // fuerza unicidad ahí.
    return this.prisma.$transaction(async (tx) => {
      if (data.isInitial) {
        await tx.complaintStage.updateMany({
          where: { companyId, isInitial: true, id: { not: id } },
          data: { isInitial: false },
        });
      }
      const updated = await tx.complaintStage.update({
        where: { id },
        data: {
          ...(data.label !== undefined ? { label: data.label.trim() } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.order !== undefined ? { order: data.order } : {}),
          ...(data.isFinal !== undefined ? { isFinal: data.isFinal } : {}),
          ...(data.isInitial !== undefined
            ? { isInitial: data.isInitial }
            : {}),
        },
      });
      await this.validarIntegridadEtapas(tx, companyId);
      return updated;
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
