import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CacheService } from '../../cache/cache.service';
import type { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import type { CacaoConfigService } from '../config/cacao-config.service';
import { CacaoShipmentsService } from './shipments.service';
import type { CreateShipmentDto } from './dto/create-shipment.dto';

function armar() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoLot: { findMany: jest.fn(), update: jest.fn() },
    cacaoShipment: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    cacaoKardex: { findFirst: jest.fn(), create: jest.fn() },
    cacaoReceivable: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoClient: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
  };
  const unitConfig = { getFactor: jest.fn().mockResolvedValue(1) };
  // La empresa configuró 75 días de plazo de cobro.
  const config = { plazoCobro: jest.fn().mockResolvedValue(75) };
  const cache = { invalidate: jest.fn() };
  const service = new CacaoShipmentsService(
    prisma as unknown as PrismaService,
    unitConfig as unknown as CacaoUnitConfigService,
    config as unknown as CacaoConfigService,
    cache as unknown as CacheService,
  );
  tx.cacaoShipment.create.mockResolvedValue({ id: 8 });
  tx.cacaoShipment.findUniqueOrThrow.mockResolvedValue({ id: 8 });
  tx.cacaoKardex.findFirst.mockResolvedValue({
    balanceQty: 890,
    balanceCost: 2848,
  });
  return { tx, prisma, unitConfig, config, cache, service };
}

const lote = { id: 2, code: 'LOTE-2', netWeight: 890, averageCost: 3.2 };

function dto(over: Partial<CreateShipmentDto> = {}): CreateShipmentDto {
  return {
    date: '2026-10-20',
    clientId: 3,
    contractRef: ' EJ-CONT-001 ',
    salePrice: 4.5,
    lots: [{ lotId: 2, quantity: 500 }],
    ...over,
  };
}

describe('CacaoShipmentsService.create', () => {
  it('rechaza un cliente de otra empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoClient.findFirst.mockResolvedValue(null);
    await expect(service.create(dto(), 4, 9)).rejects.toThrow(
      /Cliente no encontrado/,
    );
  });

  it('rechaza el mismo lote dos veces', async () => {
    const { service } = armar();
    await expect(
      service.create(
        dto({
          lots: [
            { lotId: 2, quantity: 10 },
            { lotId: 2, quantity: 20 },
          ],
        }),
        4,
        9,
      ),
    ).rejects.toThrow(/mismo lote/);
  });

  it('rechaza un lote inexistente o de otra empresa', async () => {
    const { tx, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([]);
    await expect(service.create(dto(), 4, 9)).rejects.toThrow(
      /Lote 2 no encontrado/,
    );
  });

  it('no embarca más de lo que hay y no toca nada', async () => {
    const { tx, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([{ ...lote, netWeight: 300 }]);
    await expect(service.create(dto(), 4, 9)).rejects.toThrow(
      /no tiene suficiente peso/,
    );
    expect(tx.cacaoShipment.create).not.toHaveBeenCalled();
    expect(tx.cacaoLot.update).not.toHaveBeenCalled();
    expect(tx.cacaoReceivable.create).not.toHaveBeenCalled();
  });

  it('calcula costo, venta y margen en el servidor con el precio en $/kg', async () => {
    const { tx, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    await service.create(
      // La pantalla manda costos falsos: deben ignorarse.
      dto({ totalCost: 1, margin: 999, totalWeight: 1 }),
      4,
      9,
    );
    const args = tx.cacaoShipment.create.mock.calls[0][0] as {
      data: {
        totalCost: number;
        totalWeightKg: number;
        salePricePerKg: number;
        margin: number;
        contractRef: string;
        lots: { create: Array<{ unitCost: number; saleAmount: number }> };
      };
    };
    // 500 kg × $3.20 = $1600 de costo; 500 kg × $4.50 = $2250 de venta
    expect(args.data.totalCost).toBe(1600);
    expect(args.data.totalWeightKg).toBe(500);
    expect(args.data.salePricePerKg).toBe(4.5);
    expect(args.data.margin).toBe(40.6); // (2250 / 1600 − 1) × 100
    expect(args.data.contractRef).toBe('EJ-CONT-001');
    expect(args.data.lots.create[0].unitCost).toBe(3.2);
    expect(args.data.lots.create[0].saleAmount).toBe(2250);
  });

  it('en sacos usa el peso del saco de la empresa para todo', async () => {
    const { tx, unitConfig, service } = armar();
    unitConfig.getFactor.mockResolvedValue(70);
    tx.cacaoLot.findMany.mockResolvedValue([{ ...lote, netWeight: 1000 }]);
    await service.create(
      dto({ unitOfMeasure: 'SACO', lots: [{ lotId: 2, quantity: 10 }] }),
      4,
      9,
    );
    expect(unitConfig.getFactor).toHaveBeenCalledWith('SACO', 4);
    const args = tx.cacaoShipment.create.mock.calls[0][0] as {
      data: { totalWeight: number; totalWeightKg: number; totalCost: number };
    };
    expect(args.data.totalWeight).toBe(10);
    expect(args.data.totalWeightKg).toBe(700);
    expect(args.data.totalCost).toBe(2240); // 700 kg × $3.20, no multiplicado por el factor
    const salida = tx.cacaoKardex.create.mock.calls[0][0] as {
      data: { quantity: number; totalCost: number; unitCost: number };
    };
    expect(salida.data.quantity).toBe(700);
    expect(salida.data.totalCost).toBe(2240);
    expect(salida.data.unitCost).toBe(3.2);
  });

  it('descuenta el lote, lo cierra si se agota y registra la salida del kárdex', async () => {
    const { tx, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([{ ...lote, netWeight: 500 }]);
    await service.create(dto(), 4, 9);
    expect(tx.cacaoLot.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { netWeight: 0, status: 'CLOSED' },
    });
    const salida = tx.cacaoKardex.create.mock.calls[0][0] as {
      data: { type: string; balanceQty: number; balanceCost: number };
    };
    expect(salida.data.type).toBe('EXIT');
    expect(salida.data.balanceQty).toBe(390); // 890 − 500
    expect(salida.data.balanceCost).toBe(1248); // 2848 − 1600
  });

  it('deja el lote abierto si queda peso', async () => {
    const { tx, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    await service.create(dto(), 4, 9);
    expect(tx.cacaoLot.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { netWeight: 390, status: 'OPEN' },
    });
  });

  it('la cuenta por cobrar usa el plazo de la empresa, salvo que el embarque traiga el suyo', async () => {
    const a = armar();
    a.tx.cacaoLot.findMany.mockResolvedValue([lote]);
    const antes = Date.now();
    await a.service.create(dto(), 4, 9);
    expect(a.config.plazoCobro).toHaveBeenCalledWith(4);
    const cxc = a.tx.cacaoReceivable.create.mock.calls[0][0] as {
      data: { totalAmount: number; dueDate: Date; shipmentId: number };
    };
    expect(cxc.data.totalAmount).toBe(2250);
    expect(cxc.data.shipmentId).toBe(8);
    expect((cxc.data.dueDate.getTime() - antes) / 86_400_000).toBeCloseTo(
      75,
      1,
    );

    const b = armar();
    b.tx.cacaoLot.findMany.mockResolvedValue([lote]);
    await b.service.create(dto({ dueDays: 10 }), 4, 9);
    expect(b.config.plazoCobro).not.toHaveBeenCalled();
    const cxcB = b.tx.cacaoReceivable.create.mock.calls[0][0] as {
      data: { dueDate: Date };
    };
    expect((cxcB.data.dueDate.getTime() - Date.now()) / 86_400_000).toBeCloseTo(
      10,
      1,
    );
  });

  it('todo ocurre en una transacción con los lotes bloqueados', async () => {
    const { prisma, tx, cache, service } = armar();
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    await service.create(dto(), 4, 9);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('un error de unidad (saco sin configurar) impide crear nada', async () => {
    const { prisma, unitConfig, service } = armar();
    unitConfig.getFactor.mockRejectedValue(
      new BadRequestException('Falta configurar el peso del saco'),
    );
    await expect(
      service.create(dto({ unitOfMeasure: 'SACO' }), 4, 9),
    ).rejects.toThrow(/Falta configurar/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
