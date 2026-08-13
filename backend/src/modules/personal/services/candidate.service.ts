import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, columnId?: number) {
    const where: any = { companyId };
    if (columnId) where.columnId = columnId;
    return this.prisma.candidate.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: number, companyId: number) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId }, include: { history: { include: { performer: true }, orderBy: { createdAt: 'desc' } } } });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return c;
  }

  async create(data: any, companyId: number, userId: number) {
    const existing = await this.prisma.candidate.findFirst({ where: { companyId, cedula: data.cedula } });
    if (existing) throw new ConflictException('Ya existe un candidato con esa cédula');
    return this.prisma.candidate.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async update(id: number, data: any, companyId: number) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return this.prisma.candidate.update({ where: { id }, data });
  }

  async move(id: number, columnId: number | null, companyId: number, userId: number) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId }, include: { column: true } });
    if (!c) throw new NotFoundException('Candidato no encontrado');

    const toColumn = columnId ? await this.prisma.kanbanColumn.findFirst({ where: { id: columnId, companyId } }) : null;

    await this.prisma.candidateHistory.create({
      data: {
        candidateId: id,
        fromColumn: c.column?.name || null,
        toColumn: toColumn?.name || 'SIN_COLUMNA',
        performedBy: userId,
      },
    });

    return this.prisma.candidate.update({ where: { id }, data: { columnId } });
  }

  async getHistory(id: number, companyId: number) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Candidato no encontrado');
    return this.prisma.candidateHistory.findMany({ where: { candidateId: id }, include: { performer: true }, orderBy: { createdAt: 'desc' } });
  }
}
