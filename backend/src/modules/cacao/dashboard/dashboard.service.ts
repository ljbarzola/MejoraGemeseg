import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class CacaoDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getDashboard(companyId: number) {
    const cacheKey = `dashboard:${companyId}`;
    const cached =
      await this.cache.get<ReturnType<typeof this.fetchDashboard>>(cacheKey);
    if (cached) return cached;

    const result = await this.fetchDashboard(companyId);
    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  private async fetchDashboard(companyId: number) {
    const [
      lots,
      fixings,
      payables,
      receivables,
      recentShipments,
      porAprobar,
      calidades,
      proveedores,
      recepciones,
      saco,
    ] = await Promise.all([
        this.prisma.cacaoLot.findMany({
          where: { companyId, status: 'OPEN' },
          select: { netWeight: true, averageCost: true },
        }),
        this.prisma.cacaoPriceFixing.findMany({
          where: { companyId, status: 'OPEN' },
          select: { pendingWeight: true, fixedPrice: true },
        }),
        this.prisma.cacaoPayable.findMany({
          where: { companyId, status: { notIn: ['PAID', 'CANCELLED'] } },
          select: { totalAmount: true, paidAmount: true },
        }),
        this.prisma.cacaoReceivable.findMany({
          where: { companyId, status: { not: 'RECEIVED' } },
          select: { totalAmount: true, receivedAmount: true },
        }),
        this.prisma.cacaoShipment.findMany({
          where: { companyId },
          include: { client: true },
          orderBy: { date: 'desc' },
          take: 5,
        }),
        // Liquidaciones que esperan la aprobación de un gerente (todavía no son deuda).
        this.prisma.cacaoSettlement.aggregate({
          where: { companyId, status: 'PENDING' },
          _count: true,
          _sum: { totalAmount: true },
        }),
        // Lo que ya está configurado: alimenta la guía de primeros pasos de una empresa nueva.
        this.prisma.cacaoQuality.count({ where: { companyId } }),
        this.prisma.cacaoSupplier.count({ where: { companyId } }),
        this.prisma.cacaoReception.count({ where: { companyId } }),
        this.prisma.cacaoUnitConfig.count({
          where: { companyId, isDefault: true },
        }),
      ]);

    const totalInventoryKg = lots.reduce((sum, l) => sum + l.netWeight, 0);
    const inventoryValue = lots.reduce(
      (sum, l) => sum + l.netWeight * l.averageCost,
      0,
    );
    const openFixingKg = fixings.reduce(
      (sum, f) => sum + (f.pendingWeight || 0),
      0,
    );
    const openFixingValue = fixings.reduce(
      (sum, f) => sum + (f.pendingWeight || 0) * (f.fixedPrice || 0),
      0,
    );
    const totalPayables = payables.reduce(
      (sum, p) => sum + (p.totalAmount - p.paidAmount),
      0,
    );
    const totalReceivables = receivables.reduce(
      (sum, r) => sum + (r.totalAmount - r.receivedAmount),
      0,
    );

    return {
      inventoryValue,
      totalInventoryKg,
      openFixingValue,
      openFixingKg,
      totalPayables,
      totalReceivables,
      payableCount: payables.length,
      receivableCount: receivables.length,
      recentShipments,
      pendingApprovalCount: porAprobar._count,
      pendingApprovalAmount: porAprobar._sum.totalAmount ?? 0,
      setup: {
        calidades: calidades > 0,
        saco: saco > 0,
        proveedores: proveedores > 0,
        recepciones: recepciones > 0,
      },
    };
  }
}
