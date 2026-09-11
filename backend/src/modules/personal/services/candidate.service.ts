import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
  ) {}

  async findAll(companyId: number, columnId?: number) {
    const where: any = { companyId };
    if (columnId) where.columnId = columnId;
    return this.prisma.candidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const c = await this.prisma.candidate.findFirst({
      where: { id, companyId },
      include: {
        history: {
          include: { performer: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return c;
  }

  async create(data: any, companyId: number, userId: number) {
    const existing = await this.prisma.candidate.findFirst({
      where: { companyId, cedula: data.cedula },
    });
    if (existing)
      throw new ConflictException('Ya existe un candidato con esa cédula');
    return this.prisma.candidate.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async update(id: number, data: any, companyId: number) {
    const c = await this.prisma.candidate.findFirst({
      where: { id, companyId },
    });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return this.prisma.candidate.update({ where: { id }, data });
  }

  async move(
    id: number,
    columnId: number | null,
    companyId: number,
    userId: number,
  ) {
    const c = await this.prisma.candidate.findFirst({
      where: { id, companyId },
      include: { column: true },
    });
    if (!c) throw new NotFoundException('Candidato no encontrado');

    const toColumn = columnId
      ? await this.prisma.kanbanColumn.findFirst({
          where: { id: columnId, companyId },
        })
      : null;

    await this.prisma.candidateHistory.create({
      data: {
        candidateId: id,
        fromColumn: c.column?.name || null,
        toColumn: toColumn?.name || 'SIN_COLUMNA',
        performedBy: userId,
      },
    });

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: { columnId },
    });

    if (toColumn?.triggersHire) {
      try {
        await this.movimientoPersonalService.crearEntrada({
          cedula: c.cedula,
          nombreGuardia: c.fullName,
          candidateId: c.id,
          companyId,
          userId,
          origen: `KANBAN_COLUMNA:${toColumn.name}`,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo crear el movimiento de entrada para el candidato ${c.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return updated;
  }

  async getHistory(id: number, companyId: number) {
    const c = await this.prisma.candidate.findFirst({
      where: { id, companyId },
    });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return this.prisma.candidateHistory.findMany({
      where: { candidateId: id },
      include: { performer: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
