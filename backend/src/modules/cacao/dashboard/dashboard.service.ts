import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CacaoDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: number) {
    const [lots, fixings, payables, receivables, recentShipments] = await Promise.all([
      this.prisma.cacaoLot.findMany({
        where: { companyId, status: 'OPEN' },
        select: { netWeight: true, averageCost: true },
      }),
      this.prisma.cacaoPriceFixing.findMany({
        where: { companyId, status: 'OPEN' },
        select: { pendingWeight: true, fixedPrice: true },
      }),
      this.prisma.cacaoPayable.findMany({
        where: { companyId, status: { not: 'PAID' } },
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
    ]);

    const totalInventoryKg = lots.reduce((sum, l) => sum + l.netWeight, 0);
    const inventoryValue = lots.reduce((sum, l) => sum + l.netWeight * l.averageCost, 0);
    const openFixingKg = fixings.reduce((sum, f) => sum + (f.pendingWeight || 0), 0);
    const openFixingValue = fixings.reduce((sum, f) => sum + (f.pendingWeight || 0) * (f.fixedPrice || 0), 0);
    const totalPayables = payables.reduce((sum, p) => sum + (p.totalAmount - p.paidAmount), 0);
    const totalReceivables = receivables.reduce((sum, r) => sum + (r.totalAmount - r.receivedAmount), 0);

    return {
      inventoryValue,
      totalInventoryKg,
      openFixingValue,
      openFixingKg,
      totalPayables,
      totalReceivables,
      recentShipments,
    };
  }
}
