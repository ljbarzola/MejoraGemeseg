import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  CacaoSettlementsService,
  calcularLoteLiquidacion,
} from './settlements.service';
import type { CreateSettlementDto } from './dto/create-settlement.dto';
import type { CacaoConfigService } from '../config/cacao-config.service';

describe('calcularLoteLiquidacion', () => {
  it('aplica humedad, impurezas y castigo por kg', () => {
    const r = calcularLoteLiquidacion(1000, 8, 1, 0.1, 2.1);
    expect(r.discountKg).toBe(90);
    expect(r.netKg).toBe(910);
    expect(r.effectiveCost).toBeCloseTo(2, 10);
    expect(r.amount).toBe(1820);
  });

  it('el castigo nunca deja el costo por debajo de cero', () => {
    const r = calcularLoteLiquidacion(500, 7, 1, 5, 2);
    expect(r.effectiveCost).toBe(0);
    expect(r.amount).toBe(0);
  });

  it('redondea el monto a 2 decimales', () => {
    const r = calcularLoteLiquidacion(333.333, 7, 1, 0, 2.05);
    expect(r.amount).toBe(Number(r.amount.toFixed(2)));
  });
});

function armar() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoLot: { findMany: jest.fn() },
    cacaoSettlementLot: { groupBy: jest.fn() },
    cacaoSettlement: {
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      // Anticipos ya descontados en liquidaciones vigentes (para el saldo del proveedor).
      groupBy: jest.fn().mockResolvedValue([]),
    },
    // Anticipos entregados al proveedor (para el saldo del proveedor).
    cacaoSupplierAdvance: { groupBy: jest.fn().mockResolvedValue([]) },
    cacaoPayable: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cacaoPayment: { count: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoSupplier: { findFirst: jest.fn() },
    cacaoSettlement: { findFirst: jest.fn(), updateMany: jest.fn() },
  };
  // La empresa configuró 45 días de plazo de pago.
  const config = {
    plazoPago: jest.fn().mockResolvedValue(45),
    // Sin monto de aprobación configurado: un gerente puede aprobar cualquiera, como antes.
    montoAprobacionAdmin: jest.fn().mockResolvedValue(null),
  };
  const service = new CacaoSettlementsService(
    prisma as unknown as PrismaService,
    config as unknown as CacaoConfigService,
  );
  return { tx, prisma, config, service };
}

const lote = {
  id: 1,
  code: 'LOTE-2026-00001',
  averageCost: 2.1,
  quality: { humidityDiscount: 7, impurityDiscount: 1 },
  receptions: [{ netWeight: 1480 }],
};

function dto(over: Partial<CreateSettlementDto> = {}): CreateSettlementDto {
  return {
    date: '2026-10-20',
    supplierId: 5,
    periodStart: '2026-10-13',
    periodEnd: '2026-10-20',
    lots: [{ lotId: 1, quantity: 400, humidityPct: 8, qualityPunishment: 0.1 }],
    ...over,
  };
}

describe('CacaoSettlementsService.create: anticipo y forma de pago', () => {
  /** El proveedor 5 tiene `anticipado` dólares anticipados y `descontado` ya gastados en otras liquidaciones. */
  function conSaldo(anticipado: number, descontado = 0) {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    a.tx.cacaoLot.findMany.mockResolvedValue([lote]);
    a.tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    a.tx.cacaoSupplierAdvance.groupBy.mockResolvedValue([
      { supplierId: 5, _sum: { amount: anticipado } },
    ]);
    a.tx.cacaoSettlement.groupBy.mockResolvedValue(
      descontado > 0
        ? [{ supplierId: 5, _sum: { advanceApplied: descontado } }]
        : [],
    );
    a.tx.cacaoSettlement.create.mockImplementation(
      (args: { data: unknown }) => args.data,
    );
    return a;
  }
  type Creada = {
    totalAmount: number;
    advanceApplied: number;
    paymentPlan?: Array<{ method: string; amount: number }>;
  };

  // dto() liquida 400 kg a $2.00 efectivos: el valor del cacao es $728.

  it('descuenta el anticipo sin cambiar el valor del cacao', async () => {
    const a = conSaldo(300);
    const r = (await a.service.create(
      dto({ advanceApplied: 200 }),
      4,
      9,
    )) as unknown as Creada;
    expect(r.totalAmount).toBe(728); // el valor del cacao no cambia
    expect(r.advanceApplied).toBe(200);
  });

  it('bloquea al proveedor mientras descuenta (dos liquidaciones no gastan el mismo anticipo)', async () => {
    const a = conSaldo(300);
    await a.service.create(dto({ advanceApplied: 200 }), 4, 9);
    // Una llamada bloquea los lotes y otra al proveedor.
    expect(a.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('sin anticipo no consulta ni bloquea nada del proveedor', async () => {
    const a = conSaldo(300);
    const r = (await a.service.create(dto(), 4, 9)) as unknown as Creada;
    expect(r.advanceApplied).toBe(0);
    expect(a.tx.cacaoSupplierAdvance.groupBy).not.toHaveBeenCalled();
    expect(a.tx.$queryRaw).toHaveBeenCalledTimes(1); // solo el bloqueo de los lotes
  });

  it('no deja descontar más que el saldo disponible', async () => {
    const a = conSaldo(300);
    await expect(
      a.service.create(dto({ advanceApplied: 400 }), 4, 9),
    ).rejects.toThrow(
      /anticipo \(\$400\.00\) supera el saldo disponible del proveedor \(\$300\.00\)/,
    );
    expect(a.tx.cacaoSettlement.create).not.toHaveBeenCalled();
  });

  it('el saldo ya descuenta lo gastado en otras liquidaciones vigentes', async () => {
    // Anticipó 300 y otra liquidación ya descontó 250: quedan 50.
    const a = conSaldo(300, 250);
    await expect(
      a.service.create(dto({ advanceApplied: 100 }), 4, 9),
    ).rejects.toThrow(/saldo disponible del proveedor \(\$50\.00\)/);
    const ok = conSaldo(300, 250);
    await ok.service.create(dto({ advanceApplied: 50 }), 4, 9);
    expect(ok.tx.cacaoSettlement.create).toHaveBeenCalledTimes(1);
  });

  it('el anticipo no puede cubrir toda la liquidación', async () => {
    const a = conSaldo(1000);
    await expect(
      a.service.create(dto({ advanceApplied: 728 }), 4, 9),
    ).rejects.toThrow(/no puede cubrir toda la liquidación/);
    // Con 1 centavo por pagar sí pasa.
    const ok = conSaldo(1000);
    await ok.service.create(dto({ advanceApplied: 727.99 }), 4, 9);
    expect(ok.tx.cacaoSettlement.create).toHaveBeenCalledTimes(1);
  });

  it('guarda la forma de pago cuando suma lo que se debe pagar (valor menos anticipo)', async () => {
    const a = conSaldo(300);
    const r = (await a.service.create(
      dto({
        advanceApplied: 200,
        paymentPlan: [
          { method: 'TRANSFER', amount: 500 },
          { method: 'CASH', amount: 28 },
        ],
      }),
      4,
      9,
    )) as unknown as Creada;
    expect(r.paymentPlan).toEqual([
      { method: 'TRANSFER', amount: 500 },
      { method: 'CASH', amount: 28 },
    ]);
  });

  it('sin anticipo, la forma de pago debe sumar el valor del cacao', async () => {
    const a = conSaldo(0);
    const r = (await a.service.create(
      dto({
        paymentPlan: [
          { method: 'CHECK', amount: 400 },
          { method: 'CREDIT', amount: 328 },
        ],
      }),
      4,
      9,
    )) as unknown as Creada;
    expect(r.paymentPlan).toHaveLength(2);
  });

  it('rechaza una forma de pago que no cuadra y dice cuánto suma y cuánto se debe', async () => {
    const a = conSaldo(300);
    await expect(
      a.service.create(
        dto({
          advanceApplied: 200,
          paymentPlan: [{ method: 'CASH', amount: 100 }],
        }),
        4,
        9,
      ),
    ).rejects.toThrow(/suma \$100\.00 y lo que se debe pagar es \$528\.00/);
    expect(a.tx.cacaoSettlement.create).not.toHaveBeenCalled();
  });

  it('la forma de pago es opcional: sin ella no se guarda ninguna', async () => {
    const a = conSaldo(300);
    const r = (await a.service.create(dto(), 4, 9)) as unknown as Creada;
    expect(r.paymentPlan).toBeUndefined();
  });

  it('tolera un centavo de diferencia de redondeo en la forma de pago', async () => {
    const a = conSaldo(300);
    await a.service.create(
      dto({
        advanceApplied: 200,
        paymentPlan: [{ method: 'TRANSFER', amount: 528.004 }],
      }),
      4,
      9,
    );
    expect(a.tx.cacaoSettlement.create).toHaveBeenCalledTimes(1);
  });
});

describe('CacaoSettlementsService.create', () => {
  it('rechaza un proveedor de otra empresa o inexistente', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(service.create(dto(), 4, 9)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un periodo con el inicio posterior al fin', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    await expect(
      service.create(dto({ periodStart: '2026-10-25' }), 4, 9),
    ).rejects.toThrow(/inicio del periodo/);
  });

  it('rechaza el mismo lote dos veces', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    await expect(
      service.create(
        dto({
          lots: [
            { lotId: 1, quantity: 10 },
            { lotId: 1, quantity: 20 },
          ],
        }),
        4,
        9,
      ),
    ).rejects.toThrow(/mismo lote/);
  });

  it('no deja liquidar más de lo recibido menos lo ya liquidado', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([
      { lotId: 1, _sum: { quantity: 1000 } },
    ]);
    // Quedan 480 kg: pedir 500 debe fallar y no crear nada.
    await expect(
      service.create(dto({ lots: [{ lotId: 1, quantity: 500 }] }), 4, 9),
    ).rejects.toThrow(/480 kg pendientes de liquidar/);
    expect(tx.cacaoSettlement.create).not.toHaveBeenCalled();
  });

  it('no deja liquidar un lote anulado', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([
      { ...lote, status: 'VOIDED', receptions: [{ netWeight: 1480 }] },
    ]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    await expect(
      service.create(dto({ lots: [{ lotId: 1, quantity: 100 }] }), 4, 9),
    ).rejects.toThrow(/fue anulado/);
    expect(tx.cacaoSettlement.create).not.toHaveBeenCalled();
  });

  it('no deja liquidar una entrega que se cerró sin liquidar', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([
      {
        ...lote,
        receptions: [{ netWeight: 1480, closedAt: new Date('2026-10-20') }],
      },
    ]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    await expect(
      service.create(dto({ lots: [{ lotId: 1, quantity: 100 }] }), 4, 9),
    ).rejects.toThrow(/se cerró sin liquidar/);
    expect(tx.cacaoSettlement.create).not.toHaveBeenCalled();
  });

  it('rechaza un lote que no tiene recepciones de ese proveedor', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([{ ...lote, receptions: [] }]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    await expect(service.create(dto(), 4, 9)).rejects.toThrow(
      /no tiene recepciones/,
    );
  });

  it('calcula los totales en el servidor e ignora los del navegador', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([
      { lotId: 1, _sum: { quantity: 1000 } },
    ]);
    tx.cacaoSettlement.create.mockImplementation(
      (args: { data: unknown }) => args.data,
    );

    const resultado = (await service.create(
      // El navegador manda un monto falso: debe ignorarse.
      dto({ totalAmount: 99999, totalNetWeight: 1, dueDays: 15 }),
      4,
      9,
    )) as unknown as {
      status: string;
      totalAmount: number;
      totalNetWeight: number;
      totalDeductions: number;
      finalPrice: number;
      dueDays: number;
      createdBy: number;
      lots: { create: Array<{ unitCost: number; amount: number }> };
    };

    // 400 kg, humedad 8% + impurezas 1% = 36 kg; neto 364 kg × (2.10 − 0.10) = $728
    expect(resultado.status).toBe('PENDING');
    expect(resultado.totalNetWeight).toBe(364);
    expect(resultado.totalDeductions).toBe(36);
    expect(resultado.totalAmount).toBe(728);
    expect(resultado.finalPrice).toBe(2);
    expect(resultado.dueDays).toBe(15);
    expect(resultado.createdBy).toBe(9);
    // El costo sale del lote, no del navegador.
    expect(resultado.lots.create[0].unitCost).toBe(2.1);
    expect(resultado.lots.create[0].amount).toBe(728);
  });

  it('si no se indica plazo usa el que configuró la empresa', async () => {
    const { prisma, tx, config, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    tx.cacaoSettlement.create.mockImplementation(
      (args: { data: unknown }) => args.data,
    );
    const r = (await service.create(dto(), 4, 9)) as unknown as {
      dueDays: number;
    };
    expect(config.plazoPago).toHaveBeenCalledWith(4);
    expect(r.dueDays).toBe(45);
  });

  it('bloquea los lotes dentro de la transacción', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 5 });
    tx.cacaoLot.findMany.mockResolvedValue([lote]);
    tx.cacaoSettlementLot.groupBy.mockResolvedValue([]);
    tx.cacaoSettlement.create.mockResolvedValue({ id: 1 });
    await service.create(dto(), 4, 9);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('CacaoSettlementsService.approve', () => {
  const pendiente = {
    id: 7,
    status: 'PENDING',
    createdBy: 9,
    supplierId: 5,
    totalAmount: 728,
    dueDays: 20,
  };

  it('no deja aprobar a quien la creó', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue(pendiente);
    await expect(service.approve(7, 4, 9, UserRole.ADMIN)).rejects.toThrow(ForbiddenException);
  });

  it('un gerente no aprueba lo que supera el monto de la empresa; un administrador sí', async () => {
    const { prisma, tx, config, service } = armar();
    config.montoAprobacionAdmin.mockResolvedValue(500);
    prisma.cacaoSettlement.findFirst.mockResolvedValue(pendiente); // $728 > $500
    await expect(service.approve(7, 4, 3, UserRole.MANAGER)).rejects.toThrow(
      /la debe aprobar un administrador/,
    );
    expect(tx.cacaoSettlement.updateMany).not.toHaveBeenCalled();

    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.cacaoPayable.findUnique.mockResolvedValue(null);
    await service.approve(7, 4, 3, UserRole.ADMIN);
    expect(tx.cacaoSettlement.updateMany).toHaveBeenCalled();
  });

  it('un gerente aprueba lo que no supera el monto, y todo si no hay monto', async () => {
    const { prisma, tx, config, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue(pendiente);
    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.cacaoPayable.findUnique.mockResolvedValue(null);

    config.montoAprobacionAdmin.mockResolvedValue(728); // justo en el monto: pasa
    await service.approve(7, 4, 3, UserRole.MANAGER);

    config.montoAprobacionAdmin.mockResolvedValue(null); // sin monto: como antes
    await service.approve(7, 4, 3, UserRole.MANAGER);
    expect(tx.cacaoSettlement.updateMany).toHaveBeenCalledTimes(2);
  });

  it('solo aprueba una liquidación pendiente', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue({
      ...pendiente,
      status: 'APPROVED',
    });
    await expect(service.approve(7, 4, 3, UserRole.ADMIN)).rejects.toThrow(BadRequestException);
  });

  it('avisa si otra persona la decidió al mismo tiempo', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue(pendiente);
    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve(7, 4, 3, UserRole.ADMIN)).rejects.toThrow(/ya fue decidida/);
    expect(tx.cacaoPayable.create).not.toHaveBeenCalled();
  });

  it('al aprobar crea la cuenta por pagar con el plazo de la liquidación', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue(pendiente);
    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.cacaoPayable.findUnique.mockResolvedValue(null);

    const antes = Date.now();
    await service.approve(7, 4, 3, UserRole.ADMIN);

    expect(tx.cacaoSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 7, companyId: 4, status: 'PENDING' },
      data: expect.objectContaining({ status: 'APPROVED', decidedBy: 3 }),
    });
    const args = tx.cacaoPayable.create.mock.calls[0][0] as {
      data: { totalAmount: number; status: string; dueDate: Date };
    };
    expect(args.data.totalAmount).toBe(728);
    expect(args.data.status).toBe('PENDING');
    const dias = (args.data.dueDate.getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(19.99);
    expect(dias).toBeLessThan(20.01);
  });

  it('la deuda nace por el valor del cacao menos el anticipo descontado', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue({
      ...pendiente,
      advanceApplied: 200,
    });
    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.cacaoPayable.findUnique.mockResolvedValue(null);
    await service.approve(7, 4, 3, UserRole.ADMIN);
    const args = tx.cacaoPayable.create.mock.calls[0][0] as {
      data: { totalAmount: number };
    };
    expect(args.data.totalAmount).toBe(528); // 728 - 200
  });

  it('usa 30 días si la liquidación no trae plazo', async () => {
    const { prisma, tx, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue({
      ...pendiente,
      dueDays: null,
    });
    tx.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.cacaoPayable.findUnique.mockResolvedValue(null);
    const antes = Date.now();
    await service.approve(7, 4, 3, UserRole.ADMIN);
    const args = tx.cacaoPayable.create.mock.calls[0][0] as {
      data: { dueDate: Date };
    };
    expect((args.data.dueDate.getTime() - antes) / 86_400_000).toBeCloseTo(
      30,
      1,
    );
  });
});

describe('CacaoSettlementsService.approveMany', () => {
  it('aprueba las que se puede y explica por qué no las demás, sin detenerse', async () => {
    const { service } = armar();
    const approve = jest
      .spyOn(service, 'approve')
      .mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(
            new ForbiddenException(
              'La liquidación debe aprobarla otra persona, no quien la creó',
            ),
          );
        }
        if (id === 3) {
          return Promise.reject(new Error('se cayó la base: detalle interno'));
        }
        return Promise.resolve({} as never);
      });

    const r = await service.approveMany([1, 2, 3, 4], 4, 9, UserRole.ADMIN);

    expect(approve).toHaveBeenCalledTimes(4);
    expect(approve).toHaveBeenCalledWith(1, 4, 9, UserRole.ADMIN);
    expect(r.aprobadas).toEqual([1, 4]);
    expect(r.omitidas).toEqual([
      {
        id: 2,
        motivo: 'La liquidación debe aprobarla otra persona, no quien la creó',
      },
      // un error que no es de negocio no se muestra tal cual
      { id: 3, motivo: 'No se pudo aprobar. Inténtalo de nuevo.' },
    ]);
  });

  it('no repite un mismo id', async () => {
    const { service } = armar();
    const approve = jest
      .spyOn(service, 'approve')
      .mockResolvedValue({} as never);
    const r = await service.approveMany([5, 5, 5], 4, 9, UserRole.ADMIN);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(r.aprobadas).toEqual([5]);
  });
});

describe('CacaoSettlementsService.reject y cancel', () => {
  it('rechaza solo una liquidación pendiente y guarda el motivo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue({
      id: 7,
      status: 'PENDING',
    });
    prisma.cacaoSettlement.updateMany.mockResolvedValue({ count: 1 });
    await service.reject(7, 4, 3, '  Precio distinto  ');
    expect(prisma.cacaoSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 7, companyId: 4, status: 'PENDING' },
      data: expect.objectContaining({
        status: 'REJECTED',
        decisionReason: 'Precio distinto',
      }),
    });
  });

  it('no rechaza una ya aprobada', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSettlement.findFirst.mockResolvedValue({
      id: 7,
      status: 'APPROVED',
    });
    await expect(service.reject(7, 4, 3, 'x motivo')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no anula una liquidación que no está aprobada', async () => {
    const { tx, service } = armar();
    tx.cacaoSettlement.findFirst.mockResolvedValue({
      id: 7,
      status: 'PENDING',
      payable: null,
    });
    await expect(service.cancel(7, 4, 3, 'motivo')).rejects.toThrow(
      /Solo se puede anular una liquidación aprobada/,
    );
  });

  it('no anula si ya tiene pagos vigentes', async () => {
    const { tx, service } = armar();
    tx.cacaoSettlement.findFirst.mockResolvedValue({
      id: 7,
      status: 'APPROVED',
      payable: { id: 2, paidAmount: 100 },
    });
    tx.cacaoPayment.count.mockResolvedValue(1);
    await expect(service.cancel(7, 4, 3, 'motivo')).rejects.toThrow(
      /tiene pagos registrados/,
    );
    expect(tx.cacaoSettlement.update).not.toHaveBeenCalled();
  });

  it('anula la liquidación y su cuenta por pagar', async () => {
    const { prisma, tx, service } = armar();
    tx.cacaoSettlement.findFirst.mockResolvedValue({
      id: 7,
      status: 'APPROVED',
      payable: { id: 2, paidAmount: 0 },
    });
    tx.cacaoPayment.count.mockResolvedValue(0);
    prisma.cacaoSettlement.findFirst.mockResolvedValue({ id: 7 });
    await service.cancel(7, 4, 3, ' error ');
    expect(tx.cacaoSettlement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        status: 'CANCELLED',
        decisionReason: 'error',
      }),
    });
    expect(tx.cacaoPayable.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: 'CANCELLED' },
    });
  });
});

describe('CacaoSettlementsService.getAvailableLots', () => {
  it('descuenta lo ya liquidado y no baja de cero', async () => {
    const prisma = {
      cacaoSupplier: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
      cacaoLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...lote,
            id: 1,
            status: 'OPEN',
            receptions: [
              { netWeight: 1480, date: new Date(), unitOfMeasure: 'KG' },
            ],
          },
          {
            ...lote,
            id: 2,
            code: 'LOTE-2',
            status: 'CLOSED',
            receptions: [
              { netWeight: 500, date: new Date(), unitOfMeasure: 'KG' },
            ],
          },
        ]),
      },
      cacaoSettlementLot: {
        groupBy: jest.fn().mockResolvedValue([
          { lotId: 1, _sum: { quantity: 1000 } },
          { lotId: 2, _sum: { quantity: 600 } },
        ]),
      },
    };
    const service = new CacaoSettlementsService(
      prisma as unknown as PrismaService,
      {} as unknown as CacaoConfigService,
    );
    const r = await service.getAvailableLots(5, 4);
    expect(r.find((l) => l.id === 1)?.availableKg).toBe(480);
    // Liquidado de más (dato viejo): nunca negativo.
    expect(r.find((l) => l.id === 2)?.availableKg).toBe(0);
  });

  it('una entrega cerrada sin liquidar no tiene nada disponible para liquidar', async () => {
    const prisma = {
      cacaoSupplier: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
      cacaoLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...lote,
            id: 1,
            status: 'OPEN',
            receptions: [
              {
                netWeight: 1480,
                date: new Date(),
                unitOfMeasure: 'KG',
                closedAt: new Date(),
              },
            ],
          },
        ]),
      },
      cacaoSettlementLot: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new CacaoSettlementsService(
      prisma as unknown as PrismaService,
      {} as unknown as CacaoConfigService,
    );
    const r = await service.getAvailableLots(5, 4);
    expect(r[0].availableKg).toBe(0);
    expect(r[0].closed).toBe(true);
  });

  it('falla si el proveedor no es de la empresa', async () => {
    const prisma = {
      cacaoSupplier: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CacaoSettlementsService(
      prisma as unknown as PrismaService,
      {} as unknown as CacaoConfigService,
    );
    await expect(service.getAvailableLots(5, 4)).rejects.toThrow(
      NotFoundException,
    );
  });
});
