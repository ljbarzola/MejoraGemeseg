import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { liquidadoPorLote } from '../common/liquidado.util';
import { calcularCompras, type RecepcionCompra } from './compras.util';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Hasta cuántos días se muestra el precio día por día; más allá se agrupa por semana. */
const DIAS_POR_DIA = 35;
const DIAS_MAXIMOS = 400;

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

  /**
   * Compras del periodo (por fecha de recepción): cifras, por proveedor, por calidad y precio
   * promedio por quintal en el tiempo. `desde` y `hasta` son días `AAAA-MM-DD`, ambos incluidos.
   */
  async getCompras(companyId: number, desde: string, hasta: string) {
    if (!FECHA.test(desde ?? '') || !FECHA.test(hasta ?? '')) {
      throw new BadRequestException('Indica el periodo con fechas AAAA-MM-DD');
    }
    const inicio = new Date(`${desde}T00:00:00.000Z`);
    const fin = new Date(`${hasta}T23:59:59.999Z`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('Las fechas del periodo no son válidas');
    }
    if (inicio > fin) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha fin',
      );
    }
    const dias = Math.round((fin.getTime() - inicio.getTime()) / DIA_MS);
    if (dias > DIAS_MAXIMOS) {
      throw new BadRequestException(
        `El periodo no puede superar ${DIAS_MAXIMOS} días`,
      );
    }

    const recepciones = await this.prisma.cacaoReception.findMany({
      where: { companyId, voidedAt: null, date: { gte: inicio, lte: fin } },
      include: {
        supplier: { select: { name: true } },
        lot: {
          select: { averageCost: true, quality: { select: { name: true } } },
        },
      },
      orderBy: { date: 'asc' },
    });
    const liquidado = await liquidadoPorLote(
      this.prisma,
      companyId,
      recepciones.map((r) => r.lotId).filter((id): id is number => id !== null),
    );

    const entregas: RecepcionCompra[] = recepciones.map((r) => ({
      date: r.date,
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      qualityName: r.lot?.quality?.name ?? null,
      netWeight: r.netWeight,
      costoPorKg: r.lot?.averageCost ?? r.provisionalPrice,
      liquidadoKg: r.lotId === null ? 0 : (liquidado.get(r.lotId) ?? 0),
      closedAt: r.closedAt,
    }));

    return {
      desde,
      hasta,
      ...calcularCompras(entregas, dias + 1 <= DIAS_POR_DIA ? 'dia' : 'semana'),
    };
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
      puntos,
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
        where: { companyId, status: { notIn: ['RECEIVED', 'CANCELLED'] } },
        select: { totalAmount: true, receivedAmount: true },
      }),
      this.prisma.cacaoShipment.findMany({
        where: { companyId, status: { not: 'CANCELLED' } },
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
      this.prisma.cacaoPunto.count({ where: { companyId, activo: true } }),
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
        puntos: puntos > 0,
      },
    };
  }
}
