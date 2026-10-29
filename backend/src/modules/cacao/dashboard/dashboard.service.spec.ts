import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CacheService } from '../../cache/cache.service';
import { CacaoDashboardService } from './dashboard.service';

function armar(recepciones: unknown[] = [], liquidado: unknown[] = []) {
  const prisma = {
    cacaoReception: { findMany: jest.fn().mockResolvedValue(recepciones) },
    cacaoSettlementLot: { groupBy: jest.fn().mockResolvedValue(liquidado) },
  };
  const service = new CacaoDashboardService(
    prisma as unknown as PrismaService,
    {} as unknown as CacheService,
  );
  return { prisma, service };
}

describe('CacaoDashboardService.getCompras', () => {
  it('exige fechas AAAA-MM-DD válidas y en orden', async () => {
    const { service } = armar();
    await expect(
      service.getCompras(4, '27/10/2026', '2026-10-27'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getCompras(4, '2026-10-27', undefined as unknown as string),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getCompras(4, '2026-13-45', '2026-13-46'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getCompras(4, '2026-10-28', '2026-10-27'),
    ).rejects.toThrow(/posterior/);
  });

  it('no deja pedir más de 400 días', async () => {
    const { service } = armar();
    await expect(
      service.getCompras(4, '2025-01-01', '2026-10-27'),
    ).rejects.toThrow(/400 días/);
  });

  it('consulta solo la empresa y el periodo (ambos días incluidos)', async () => {
    const { prisma, service } = armar();
    await service.getCompras(4, '2026-10-01', '2026-10-27');
    const donde = (
      prisma.cacaoReception.findMany.mock.calls[0][0] as {
        where: { companyId: number; date: { gte: Date; lte: Date } };
      }
    ).where;
    expect(donde.companyId).toBe(4);
    expect(donde.date.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(donde.date.lte.toISOString()).toBe('2026-10-27T23:59:59.999Z');
  });

  it('arma el resumen con el costo del lote, lo liquidado y lo cerrado', async () => {
    const recepcion = (
      id: number,
      lotId: number,
      over: Record<string, unknown> = {},
    ) => ({
      id,
      lotId,
      date: new Date('2026-10-05T00:00:00.000Z'),
      supplierId: 1,
      supplier: { name: 'Proveedor A' },
      lot: { averageCost: 2, quality: { name: 'CCN-51' } },
      netWeight: 1000,
      provisionalPrice: 9,
      closedAt: null,
      ...over,
    });
    const { service } = armar(
      [
        recepcion(1, 10),
        recepcion(2, 11, { closedAt: new Date() }),
        recepcion(3, 12, { lot: null }), // sin lote: usa el precio provisional
      ],
      [{ lotId: 10, _sum: { quantity: 1000 } }],
    );
    const r = await service.getCompras(4, '2026-10-01', '2026-10-31');
    expect(r.totales.entregas).toBe(3);
    // 1000×2 + 1000×2 + 1000×9
    expect(r.totales.compra).toBe(13000);
    expect(r.totales).toMatchObject({
      liquidadas: 1,
      cerradas: 1,
      sinLiquidar: 1,
    });
    expect(r.agrupadoPor).toBe('dia');
  });

  it('con un periodo largo agrupa por semana', async () => {
    const { service } = armar();
    const r = await service.getCompras(4, '2026-01-01', '2026-10-27');
    expect(r.agrupadoPor).toBe('semana');
  });
});
