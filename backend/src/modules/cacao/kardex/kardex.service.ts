import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class CacaoKardexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(companyId: number, query: { lotId?: string }) {
    const cacheKey = `kardex:${companyId}:${query.lotId || 'all'}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const where: any = { companyId };
    if (query.lotId) where.lotId = Number(query.lotId);
    const result = await this.prisma.cacaoKardex.findMany({
      where,
      include: { lot: true },
      orderBy: { date: 'desc' },
    });

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  async findByLot(lotId: number, companyId: number) {
    const cacheKey = `kardex:lot:${lotId}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.cacaoKardex.findMany({
      where: { lotId, companyId },
      orderBy: { date: 'asc' },
    });

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  async invalidateCache(companyId: number): Promise<void> {
    await this.cache.invalidate(`kardex:${companyId}:*`);
    await this.cache.invalidate(`dashboard:${companyId}`);
  }
}
