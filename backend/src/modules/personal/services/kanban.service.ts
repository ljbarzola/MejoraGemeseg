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

  async createColumn(data: { name: string; color?: string }, companyId: number) {
    const maxPos = await this.prisma.kanbanColumn.aggregate({ where: { companyId }, _max: { position: true } });
    return this.prisma.kanbanColumn.create({
      data: { name: data.name, color: data.color || '#718096', position: (maxPos._max.position || 0) + 1, companyId },
    });
  }

  async updateColumn(id: number, data: { name?: string; color?: string; position?: number }, companyId: number) {
    const col = await this.prisma.kanbanColumn.findFirst({ where: { id, companyId } });
    if (!col) throw new NotFoundException('Columna no encontrada');
    return this.prisma.kanbanColumn.update({ where: { id }, data });
  }

  async deleteColumn(id: number, companyId: number) {
    const col = await this.prisma.kanbanColumn.findFirst({ where: { id, companyId } });
    if (!col) throw new NotFoundException('Columna no encontrada');
    await this.prisma.candidate.updateMany({ where: { columnId: id }, data: { columnId: null } });
    return this.prisma.kanbanColumn.delete({ where: { id } });
  }

  async reorderColumns(columns: { id: number; position: number }[], companyId: number) {
    for (const col of columns) {
      await this.prisma.kanbanColumn.updateMany({ where: { id: col.id, companyId }, data: { position: col.position } });
    }
    return this.getColumns(companyId);
  }
}
