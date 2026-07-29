import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CacaoKardexService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { lotId?: string }) {
    const where: any = { companyId };
    if (query.lotId) where.lotId = Number(query.lotId);
    return this.prisma.cacaoKardex.findMany({
      where,
      include: { lot: true },
      orderBy: { date: 'desc' },
    });
  }

  async findByLot(lotId: number, companyId: number) {
    return this.prisma.cacaoKardex.findMany({
      where: { lotId, companyId },
      orderBy: { date: 'asc' },
    });
  }
}
