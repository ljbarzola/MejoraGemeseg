import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class KanbanService {
  constructor(private readonly prisma: PrismaService) {}

  async getColumns(companyId: number) {
    return this.prisma.kanbanColumn.findMany({
      where: { companyId },
      orderBy: { position: 'asc' },
      include: { candidates: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async createColumn(
    data: { name: string; color?: string; triggersHire?: boolean },
    companyId: number,
  ) {
    const maxPos = await this.prisma.kanbanColumn.aggregate({
      where: { companyId },
      _max: { position: true },
    });
    if (data.triggersHire) {
      await this.unmarkOtherHiringColumns(companyId);
    }
    return this.prisma.kanbanColumn.create({
      data: {
        name: data.name,
        color: data.color || '#718096',
        position: (maxPos._max.position || 0) + 1,
        triggersHire: data.triggersHire || false,
        companyId,
      },
    });
  }

  async updateColumn(
    id: number,
    data: {
      name?: string;
      color?: string;
      position?: number;
      triggersHire?: boolean;
    },
    companyId: number,
  ) {
    const col = await this.prisma.kanbanColumn.findFirst({
      where: { id, companyId },
    });
    if (!col) throw new NotFoundException('Columna no encontrada');
    if (data.triggersHire) {
      await this.unmarkOtherHiringColumns(companyId, id);
    }
    return this.prisma.kanbanColumn.update({ where: { id }, data });
  }

  // Solo una columna por empresa puede disparar la entrada automática de
  // Movimientos de Personal — al marcar una nueva, se desmarcan las demás.
  private async unmarkOtherHiringColumns(companyId: number, exceptId?: number) {
    await this.prisma.kanbanColumn.updateMany({
      where: {
        companyId,
        triggersHire: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { triggersHire: false },
    });
  }

  async deleteColumn(id: number, companyId: number) {
    const col = await this.prisma.kanbanColumn.findFirst({
      where: { id, companyId },
    });
    if (!col) throw new NotFoundException('Columna no encontrada');
    await this.prisma.candidate.updateMany({
      where: { columnId: id },
      data: { columnId: null },
    });
    return this.prisma.kanbanColumn.delete({ where: { id } });
  }

  async reorderColumns(
    columns: { id: number; position: number }[],
    companyId: number,
  ) {
    for (const col of columns) {
      await this.prisma.kanbanColumn.updateMany({
        where: { id: col.id, companyId },
        data: { position: col.position },
      });
    }
    return this.getColumns(companyId);
  }
}
