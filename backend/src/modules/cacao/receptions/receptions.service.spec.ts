import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CacheService } from '../../cache/cache.service';
import type { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import { CacaoReceptionsService } from './receptions.service';
import type { CreateReceptionDto } from './dto/create-reception.dto';

function armar() {
  const tx = {
    cacaoLot: { findFirst: jest.fn(), create: jest.fn() },
    cacaoReception: { create: jest.fn() },
    cacaoKardex: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    ) as jest.Mock,
    cacaoSupplier: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
    cacaoQuality: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
  };
  const unitConfig = { getFactor: jest.fn().mockResolvedValue(1) };
  const cache = { invalidate: jest.fn() };
  const service = new CacaoReceptionsService(
    prisma as unknown as PrismaService,
    unitConfig as unknown as CacaoUnitConfigService,
    cache as unknown as CacheService,
  );
  tx.cacaoLot.findFirst.mockResolvedValue(null);
  tx.cacaoLot.create.mockResolvedValue({ id: 11 });
  tx.cacaoReception.create.mockResolvedValue({ id: 21 });
  return { tx, prisma, unitConfig, cache, service };
}

function dto(over: Partial<CreateReceptionDto> = {}): CreateReceptionDto {
  return {
    date: '2026-10-20',
    supplierId: 5,
    guideNumber: ' EJ-001 ',
    grossWeight: 1500,
    tare: 20,
    humidity: 7.2,
    impurities: 0.9,
    provisionalPrice: 2.1,
    qualityId: 2,
    ...over,
  };
}

describe('CacaoReceptionsService.create', () => {
  it('rechaza un proveedor o una calidad que no son de la empresa', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(a.service.create(dto(), 4, 9)).rejects.toThrow(
      /Proveedor no encontrado/,
    );
    const b = armar();
    b.prisma.cacaoQuality.findFirst.mockResolvedValue(null);
    await expect(b.service.create(dto(), 4, 9)).rejects.toThrow(
      /Calidad no encontrada/,
    );
    const filtro = b.prisma.cacaoQuality.findFirst.mock.calls[0][0] as {
      where: { companyId: number };
    };
    expect(filtro.where.companyId).toBe(4);
  });

  it('rechaza un peso neto de cero o negativo', async () => {
    const { service, tx } = armar();
    await expect(
      service.create(dto({ grossWeight: 100, tare: 100 }), 4, 9),
    ).rejects.toThrow(BadRequestException);
    expect(tx.cacaoLot.create).not.toHaveBeenCalled();
  });

  it('guarda todo en kg con el factor de la unidad de la empresa', async () => {
    const { service, tx, unitConfig } = armar();
    unitConfig.getFactor.mockResolvedValue(90); // el saco de esta empresa pesa 90 kg
    await service.create(
      dto({ unitOfMeasure: 'SACO', grossWeight: 10, tare: 0.5 }),
      4,
      9,
    );
    expect(unitConfig.getFactor).toHaveBeenCalledWith('SACO', 4);
    const lote = tx.cacaoLot.create.mock.calls[0][0] as {
      data: { netWeight: number; code: string; qualityId: number };
    };
    expect(lote.data.netWeight).toBe(855); // (10 − 0.5) sacos × 90 kg
    expect(lote.data.qualityId).toBe(2);
    expect(lote.data.code).toMatch(/^LOTE-\d{4}-00001$/);
    const kardex = tx.cacaoKardex.create.mock.calls[0][0] as {
      data: { quantity: number; balanceQty: number; reference: string };
    };
    expect(kardex.data.quantity).toBe(855);
    expect(kardex.data.balanceQty).toBe(855);
    expect(kardex.data.reference).toBe('Recepción EJ-001');
  });

  it('crea lote, recepción y kárdex en una sola transacción y limpia el caché', async () => {
    const { service, prisma, tx, cache } = armar();
    await service.create(dto(), 4, 9);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.cacaoLot.create).toHaveBeenCalledTimes(1);
    expect(tx.cacaoReception.create).toHaveBeenCalledTimes(1);
    expect(tx.cacaoKardex.create).toHaveBeenCalledTimes(1);
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('continúa la numeración de lotes de la empresa', async () => {
    const { service, tx } = armar();
    const year = new Date().getFullYear();
    tx.cacaoLot.findFirst.mockResolvedValue({ code: `LOTE-${year}-00007` });
    await service.create(dto(), 4, 9);
    const lote = tx.cacaoLot.create.mock.calls[0][0] as {
      data: { code: string };
    };
    expect(lote.data.code).toBe(`LOTE-${year}-00008`);
  });

  it('si otro usuario tomó el mismo código de lote, reintenta', async () => {
    const { service, prisma } = armar();
    const original = prisma.$transaction.getMockImplementation();
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
      .mockImplementation(original as never);
    await service.create(dto(), 4, 9);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('no reintenta para siempre ni esconde otros errores', async () => {
    const a = armar();
    a.prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    await expect(a.service.create(dto(), 4, 9)).rejects.toThrow('dup');
    expect(a.prisma.$transaction).toHaveBeenCalledTimes(5);

    const b = armar();
    b.prisma.$transaction.mockRejectedValue(new Error('se cayó la base'));
    await expect(b.service.create(dto(), 4, 9)).rejects.toThrow(
      'se cayó la base',
    );
    expect(b.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('CacaoReceptionsService.findAll (cuánto se liquidó de cada entrega)', () => {
  function conListado(
    recepciones: Array<{ id: number; lotId: number | null }>,
    liquidado: Array<{ lotId: number; _sum: { quantity: number | null } }>,
  ) {
    const a = armar();
    const prismaExtra = a.prisma as unknown as Record<string, unknown>;
    prismaExtra.cacaoReception = {
      findMany: jest.fn().mockResolvedValue(recepciones),
    };
    const groupBy = jest.fn().mockResolvedValue(liquidado);
    prismaExtra.cacaoSettlementLot = { groupBy };
    return { ...a, groupBy };
  }

  it('suma lo liquidado por entrega e ignora las liquidaciones rechazadas o anuladas', async () => {
    const { service, groupBy } = conListado(
      [
        { id: 1, lotId: 10 },
        { id: 2, lotId: 11 },
        { id: 3, lotId: 12 },
      ],
      [{ lotId: 10, _sum: { quantity: 480.5 } }],
    );
    const lista = await service.findAll(4, {});
    expect(lista.map((r) => r.liquidadoKg)).toEqual([480.5, 0, 0]);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['lotId'],
      where: {
        lotId: { in: [10, 11, 12] },
        settlement: {
          companyId: 4,
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        },
      },
      _sum: { quantity: true },
    });
  });

  it('una recepción sin lote cuenta como sin liquidar y no consulta liquidaciones si no hay lotes', async () => {
    const { service, groupBy } = conListado([{ id: 1, lotId: null }], []);
    const lista = await service.findAll(4, {});
    expect(lista[0].liquidadoKg).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
