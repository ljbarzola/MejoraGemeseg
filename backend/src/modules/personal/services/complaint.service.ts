import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateComplaintDto,
  ChangeComplaintStageDto,
} from '../dto/complaint.dto';

@Injectable()
export class ComplaintService {
  constructor(private readonly prisma: PrismaService) {}

  // Cualquier empleado autenticado puede enviar una queja — no depende del
  // permiso de sección RRHH (ver entidad.controller.ts, esta ruta no lleva
  // @Section). Si es anónima, submittedBy queda null: no se guarda el autor
  // ni siquiera de forma oculta. Valida los campos extra que RRHH haya
  // marcado como obligatorios (ver ComplaintFieldDefinition).
  async create(dto: CreateComplaintDto, companyId: number, userId: number) {
    if (dto.description.trim().length < 5) {
      throw new BadRequestException(
        'Describe la situación con al menos 5 caracteres.',
      );
    }
    const fieldDefs = await this.prisma.complaintFieldDefinition.findMany({
      where: { companyId },
    });
    const values = dto.customFieldValues || {};
    const missing = fieldDefs.filter(
      (f) => f.required && !values[String(f.id)]?.trim(),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan campos requeridos: ${missing.map((f) => f.label).join(', ')}`,
      );
    }

    // Ya no hay un default de enum del que depender (ComplaintStatus se
    // eliminó en la Fase 5) — se busca explícitamente la etapa inicial de la
    // empresa. Si ninguna etapa está marcada isInitial (dato corrupto o
    // empresa mal configurada), se rechaza en vez de crear una queja con un
    // status que no calza con ninguna fila de ComplaintStage.
    const initialStage = await this.prisma.complaintStage.findFirst({
      where: { companyId, isInitial: true },
    });
    if (!initialStage) {
      throw new BadRequestException(
        'Esta empresa no tiene configurada una etapa inicial para las quejas. Contacta a RRHH.',
      );
    }

    return this.prisma.complaint.create({
      data: {
        description: dto.description.trim(),
        isAnonymous: dto.isAnonymous ?? false,
        submittedBy: dto.isAnonymous ? null : userId,
        customFieldValues: values,
        companyId,
        status: initialStage.key,
      },
    });
  }

  // Vista de gestión (RRHH/admin) — todas las quejas de la empresa,
  // incluidas las anónimas.
  async findAll(companyId: number) {
    return this.prisma.complaint.findMany({
      where: { companyId },
      include: {
        submitter: { select: { id: true, fullName: true, email: true } },
        stageChanges: {
          orderBy: { createdAt: 'asc' },
          include: { changer: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeStage(
    id: number,
    dto: ChangeComplaintStageDto,
    companyId: number,
    userId: number,
  ) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, companyId },
    });
    if (!complaint)
      throw new NotFoundException('Queja o sugerencia no encontrada');
    if (complaint.status === dto.toStatus) {
      throw new BadRequestException(
        'La queja o sugerencia ya está en esa etapa',
      );
    }

    // dto.toStatus es un key string libre (ya no un enum) — se valida que
    // exista como ComplaintStage de esta misma empresa antes de aceptar el
    // cambio, para que Complaint.status nunca quede apuntando a una etapa
    // inexistente (la FK compuesta del schema también lo garantiza a nivel
    // de base, pero validar acá da un mensaje claro en vez de un error 500).
    const targetStage = await this.prisma.complaintStage.findFirst({
      where: { companyId, key: dto.toStatus },
    });
    if (!targetStage) {
      throw new BadRequestException(
        `La etapa "${dto.toStatus}" no existe en esta empresa`,
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.complaintStageChange.create({
        data: {
          complaintId: id,
          fromStatus: complaint.status,
          toStatus: dto.toStatus,
          notes: dto.notes?.trim() || null,
          changedBy: userId,
          companyId,
        },
      }),
      this.prisma.complaint.update({
        where: { id },
        data: { status: dto.toStatus },
      }),
    ]);

    return updated;
  }

  async responder(
    id: number,
    notes: string,
    companyId: number,
    userId: number,
  ) {
    const texto = notes?.trim() || '';
    if (texto.length < 2) {
      throw new BadRequestException('Escribe una respuesta.');
    }
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, companyId },
    });
    if (!complaint) {
      throw new NotFoundException('Queja o sugerencia no encontrada');
    }
    await this.prisma.complaintStageChange.create({
      data: {
        complaintId: id,
        fromStatus: complaint.status,
        toStatus: complaint.status,
        notes: texto,
        changedBy: userId,
        companyId,
      },
    });
    return this.findOne(id, companyId);
  }

  async delete(id: number, companyId: number) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, companyId },
    });
    if (!complaint) {
      throw new NotFoundException('Queja o sugerencia no encontrada');
    }
    await this.prisma.complaint.delete({ where: { id } });
    return { id };
  }

  private async findOne(id: number, companyId: number) {
    return this.prisma.complaint.findFirst({
      where: { id, companyId },
      include: {
        submitter: { select: { id: true, fullName: true, email: true } },
        stageChanges: {
          orderBy: { createdAt: 'asc' },
          include: { changer: { select: { id: true, fullName: true } } },
        },
      },
    });
  }
}
