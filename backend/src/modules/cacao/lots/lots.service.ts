import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CacaoLotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { status?: string; qualityId?: string; supplierId?: string }) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.qualityId) where.qualityId = Number(query.qualityId);
    if (query.supplierId) {
      where.receptions = { some: { supplierId: Number(query.supplierId) } };
    }
    return this.prisma.cacaoLot.findMany({
      where,
      include: { quality: true, receptions: { include: { supplier: true } } },
      orderBy: { id: 'desc' },
    });
  }

  async getNextCode(companyId: number) {
    const year = new Date().getFullYear();
    const lastLot = await this.prisma.cacaoLot.findFirst({
      where: { companyId, code: { startsWith: `LOTE-${year}-` } },
      orderBy: { id: 'desc' },
    });
    const seq = lastLot ? parseInt(lastLot.code.split('-')[2]) + 1 : 1;
    return { code: `LOTE-${year}-${String(seq).padStart(3, '0')}` };
  }

  async findOne(id: number, companyId: number) {
    const lot = await this.prisma.cacaoLot.findFirst({
      where: { id, companyId },
      include: {
        quality: true,
        receptions: { include: { supplier: true }, orderBy: { date: 'asc' } },
        kardex: { orderBy: { date: 'asc' } },
        priceFixings: true,
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    return {
      ...lot,
      differential: lot.differential ?? lot.receptions[0]?.differential ?? null,
    };
  }
}
