import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CacheService } from '../../cache/cache.service';
import type { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import { CacaoReceptionsService } from './receptions.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReceptionDto } from './dto/create-reception.dto';

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
    cacaoReception: { findFirst: jest.fn().mockResolvedValue(null) },
    cacaoPunto: {
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
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

describe('CacaoReceptionsService.create: punto de acopio', () => {
  it('sin puntos configurados no pide punto y guarda la recepción sin él', async () => {
    const a = armar();
    await a.service.create(dto(), 4, 9);
    const datos = a.tx.cacaoReception.create.mock.calls[0][0] as {
      data: { puntoId: number | null };
    };
    expect(datos.data.puntoId).toBeNull();
  });

  it('con algún punto activo, la recepción debe decir dónde se recibió', async () => {
    const a = armar();
    a.prisma.cacaoPunto.count.mockResolvedValue(2);
    await expect(a.service.create(dto(), 4, 9)).rejects.toThrow(
      /Selecciona el punto de acopio/,
    );
    expect(a.tx.cacaoReception.create).not.toHaveBeenCalled();
  });

  it('guarda el punto elegido', async () => {
    const a = armar();
    a.prisma.cacaoPunto.findFirst.mockResolvedValue({ id: 8, activo: true });
    await a.service.create(dto({ puntoId: 8 }), 4, 9);
    const datos = a.tx.cacaoReception.create.mock.calls[0][0] as {
      data: { puntoId: number };
    };
    expect(datos.data.puntoId).toBe(8);
    const filtro = a.prisma.cacaoPunto.findFirst.mock.calls[0][0] as {
      where: { companyId: number };
    };
    expect(filtro.where.companyId).toBe(4);
  });

  it('rechaza un punto de otra empresa o desactivado', async () => {
    const a = armar();
    a.prisma.cacaoPunto.findFirst.mockResolvedValue(null);
    await expect(a.service.create(dto({ puntoId: 8 }), 4, 9)).rejects.toThrow(
      /Punto de acopio no encontrado/,
    );
    const b = armar();
    b.prisma.cacaoPunto.findFirst.mockResolvedValue({ id: 8, activo: false });
    await expect(b.service.create(dto({ puntoId: 8 }), 4, 9)).rejects.toThrow(
      /desactivado/,
    );
  });
});

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

describe('CacaoReceptionsService.create (ticket de pesaje y quintal)', () => {
  it('guarda chofer, placa, perfil de pesaje y número de ticket', async () => {
    const { service, tx } = armar();
    await service.create(
      dto({
        ticketNumber: 'T-0042',
        weighingProfile: 'BASCULA',
        driverName: 'Juan Pérez',
        vehiclePlate: 'ABC1234',
      }),
      4,
      9,
    );
    const recepcion = tx.cacaoReception.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(recepcion.data).toMatchObject({
      ticketNumber: 'T-0042',
      weighingProfile: 'BASCULA',
      driverName: 'Juan Pérez',
      vehiclePlate: 'ABC1234',
    });
  });

  it('sin datos de ticket guarda nulos (son opcionales)', async () => {
    const { service, tx } = armar();
    await service.create(dto(), 4, 9);
    const recepcion = tx.cacaoReception.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(recepcion.data).toMatchObject({
      ticketNumber: null,
      weighingProfile: null,
      driverName: null,
      vehiclePlate: null,
    });
  });

  it('no deja registrar dos veces el mismo ticket en la empresa', async () => {
    const { service, prisma, tx } = armar();
    prisma.cacaoReception.findFirst.mockResolvedValue({ id: 7 });
    await expect(
      service.create(dto({ ticketNumber: 'T-0042' }), 4, 9),
    ).rejects.toThrow(/número de ticket/);
    expect(prisma.cacaoReception.findFirst).toHaveBeenCalledWith({
      where: { companyId: 4, ticketNumber: 'T-0042' },
    });
    expect(tx.cacaoLot.create).not.toHaveBeenCalled();
  });

  it('si dos personas lo registran a la vez, la segunda recibe el aviso y no se reintenta', async () => {
    const { service, prisma } = armar();
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('dup'), {
        code: 'P2002',
        meta: { target: ['companyId', 'ticketNumber'] },
      }),
    );
    await expect(
      service.create(dto({ ticketNumber: 'T-0042' }), 4, 9),
    ).rejects.toThrow(/número de ticket/);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('la unidad quintal se convierte a kg con el factor universal', async () => {
    const { service, tx, unitConfig } = armar();
    unitConfig.getFactor.mockResolvedValue(45.359237);
    await service.create(
      dto({ unitOfMeasure: 'QQ', grossWeight: 10, tare: 0 }),
      4,
      9,
    );
    expect(unitConfig.getFactor).toHaveBeenCalledWith('QQ', 4);
    const lote = tx.cacaoLot.create.mock.calls[0][0] as {
      data: { netWeight: number };
    };
    // 10 qq × 45,359237 = 453,59237 kg, guardado a 4 decimales
    expect(lote.data.netWeight).toBe(453.5924);
  });
});

describe('CreateReceptionDto (datos del ticket)', () => {
  const base = {
    date: '2026-10-20',
    supplierId: 5,
    guideNumber: 'G-1',
    grossWeight: 100,
    tare: 1,
    humidity: 7,
    impurities: 1,
    qualityId: 2,
  };
  const validar = (extra: Record<string, unknown>) =>
    validate(plainToInstance(CreateReceptionDto, { ...base, ...extra }));

  it('acepta el quintal y los campos del ticket', async () => {
    const errores = await validar({
      unitOfMeasure: 'QQ',
      ticketNumber: 'T-1',
      weighingProfile: 'BULTOS',
      driverName: 'Ana',
      vehiclePlate: 'abc-123',
    });
    expect(errores).toHaveLength(0);
  });

  it('recorta los textos, pasa la placa a mayúsculas y trata lo vacío como no enviado', () => {
    const d = plainToInstance(CreateReceptionDto, {
      ...base,
      ticketNumber: '  T-9  ',
      driverName: '   ',
      vehiclePlate: ' abc-123 ',
    });
    expect(d.ticketNumber).toBe('T-9');
    expect(d.driverName).toBeUndefined();
    expect(d.vehiclePlate).toBe('ABC-123');
  });

  it('rechaza un perfil de pesaje desconocido y textos demasiado largos', async () => {
    expect(await validar({ weighingProfile: 'CAMION' })).not.toHaveLength(0);
    expect(await validar({ vehiclePlate: 'A'.repeat(16) })).not.toHaveLength(0);
    expect(await validar({ ticketNumber: 'T'.repeat(41) })).not.toHaveLength(0);
    expect(await validar({ driverName: 'N'.repeat(81) })).not.toHaveLength(0);
  });
});

describe('CacaoReceptionsService.close y reopen (entregas sin liquidar)', () => {
  function conRecepcion(
    recepcion: Record<string, unknown> | null,
    liquidadoKg: number,
  ) {
    const a = armar();
    const prismaExtra = a.prisma as unknown as Record<string, unknown>;
    const reception = {
      findFirst: jest.fn().mockResolvedValue(recepcion),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    };
    prismaExtra.cacaoReception = reception;
    prismaExtra.cacaoSettlementLot = {
      groupBy: jest
        .fn()
        .mockResolvedValue(
          liquidadoKg > 0
            ? [{ lotId: 11, _sum: { quantity: liquidadoKg } }]
            : [],
        ),
    };
    return { ...a, reception };
  }

  const abierta = { id: 3, lotId: 11, netWeight: 1000, closedAt: null };

  it('cierra una entrega sin liquidar y deja quién, cuándo y por qué', async () => {
    const { service, reception } = conRecepcion(abierta, 0);
    await service.close(3, 4, 9, '  Cacao en mal estado  ');
    expect(reception.updateMany).toHaveBeenCalledWith({
      where: { id: 3, companyId: 4, closedAt: null },
      data: {
        closedAt: expect.any(Date) as Date,
        closedBy: 9,
        closeReason: 'Cacao en mal estado',
      },
    });
  });

  it('también cierra una entrega liquidada solo en parte', async () => {
    const { service, reception } = conRecepcion(abierta, 400);
    await service.close(3, 4, 9, 'El resto no se paga');
    expect(reception.updateMany).toHaveBeenCalledTimes(1);
  });

  it('no cierra una entrega liquidada por completo', async () => {
    const { service, reception } = conRecepcion(abierta, 1000);
    await expect(service.close(3, 4, 9, 'x'.repeat(5))).rejects.toThrow(
      /ya está liquidada por completo/,
    );
    expect(reception.updateMany).not.toHaveBeenCalled();
  });

  it('no cierra dos veces ni una entrega de otra empresa', async () => {
    const cerrada = conRecepcion({ ...abierta, closedAt: new Date() }, 0);
    await expect(cerrada.service.close(3, 4, 9, 'motivo')).rejects.toThrow(
      /ya está cerrada/,
    );
    const ajena = conRecepcion(null, 0);
    await expect(ajena.service.close(3, 4, 9, 'motivo')).rejects.toThrow(
      /no encontrada/,
    );
    expect(ajena.reception.findFirst).toHaveBeenCalledWith({
      where: { id: 3, companyId: 4 },
    });
  });

  it('si otra persona la cerró a la vez, la segunda recibe el aviso', async () => {
    const { service, reception } = conRecepcion(abierta, 0);
    reception.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.close(3, 4, 9, 'motivo')).rejects.toThrow(
      /ya está cerrada/,
    );
  });

  it('reabre una entrega cerrada y borra el cierre', async () => {
    const { service, reception } = conRecepcion(
      { ...abierta, closedAt: new Date() },
      0,
    );
    await service.reopen(3, 4);
    expect(reception.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { closedAt: null, closedBy: null, closeReason: null },
    });
  });

  it('no reabre una entrega que no está cerrada', async () => {
    const { service, reception } = conRecepcion(abierta, 0);
    await expect(service.reopen(3, 4)).rejects.toThrow(/no está cerrada/);
    expect(reception.update).not.toHaveBeenCalled();
  });
});

describe('CacaoReceptionsService.void (anular una recepción)', () => {
  function conRecepcion(
    over: {
      recepcion?: Record<string, unknown> | null;
      lote?: Record<string, unknown> | null;
      liquidadoKg?: number;
      embarques?: number;
      fijaciones?: number;
    } = {},
  ) {
    const a = armar();
    const tx = a.tx as unknown as Record<string, Record<string, jest.Mock>>;
    const base = {
      id: 3,
      lotId: 11,
      netWeight: 1000,
      guideNumber: 'G-1',
      unitOfMeasure: 'KG',
      voidedAt: null,
    };
    (a.tx as unknown as { $queryRaw: jest.Mock }).$queryRaw = jest
      .fn()
      .mockResolvedValue([]);
    tx.cacaoReception = {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          over.recepcion === null ? null : { ...base, ...over.recepcion },
        ),
      update: jest.fn().mockResolvedValue({}),
    };
    tx.cacaoLot.findFirst = jest
      .fn()
      .mockResolvedValue(
        over.lote === null
          ? null
          : { id: 11, netWeight: 1000, averageCost: 2, ...over.lote },
      );
    tx.cacaoLot.update = jest.fn().mockResolvedValue({});
    tx.cacaoSettlementLot = {
      groupBy: jest
        .fn()
        .mockResolvedValue(
          over.liquidadoKg
            ? [{ lotId: 11, _sum: { quantity: over.liquidadoKg } }]
            : [],
        ),
    };
    tx.cacaoShipmentLot = {
      count: jest.fn().mockResolvedValue(over.embarques ?? 0),
    };
    tx.cacaoPriceFixing = {
      count: jest.fn().mockResolvedValue(over.fijaciones ?? 0),
    };
    tx.cacaoKardex.findFirst = jest
      .fn()
      .mockResolvedValue({ balanceQty: 1000, balanceCost: 2000 });
    const prisma = a.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.cacaoReception = {
      findFirst: jest.fn().mockResolvedValue({ id: 3 }),
    };
    return { ...a, tx };
  }

  it('deja el lote en cero y anulado, con la salida en el kárdex y el motivo', async () => {
    const { service, tx, cache } = conRecepcion();
    await service.void(3, 4, 9, '  Digité mal el peso  ');

    expect(tx.cacaoReception.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        voidedAt: expect.any(Date) as Date,
        voidedBy: 9,
        voidReason: 'Digité mal el peso',
      },
    });
    expect(tx.cacaoLot.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { netWeight: 0, status: 'VOIDED' },
    });
    const kardex = tx.cacaoKardex.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(kardex.data).toMatchObject({
      lotId: 11,
      type: 'EXIT',
      quantity: 1000,
      reference: 'Anulación recepción G-1',
      balanceQty: 0,
    });
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('no anula dos veces, sin lote o de otra empresa', async () => {
    await expect(
      conRecepcion({ recepcion: { voidedAt: new Date() } }).service.void(
        3,
        4,
        9,
        'motivo',
      ),
    ).rejects.toThrow(/ya está anulada/);
    await expect(
      conRecepcion({ recepcion: { lotId: null } }).service.void(
        3,
        4,
        9,
        'motivo',
      ),
    ).rejects.toThrow(/no tiene lote/);
    await expect(
      conRecepcion({ recepcion: null }).service.void(3, 4, 9, 'motivo'),
    ).rejects.toThrow(/no encontrada/);
  });

  it('no anula una entrega con liquidaciones vigentes', async () => {
    const { service, tx } = conRecepcion({ liquidadoKg: 300 });
    await expect(service.void(3, 4, 9, 'motivo')).rejects.toThrow(
      /liquidaciones vigentes/,
    );
    expect(tx.cacaoLot.update).not.toHaveBeenCalled();
  });

  it('no anula si el lote ya salió en un embarque (o su peso ya cambió)', async () => {
    await expect(
      conRecepcion({ embarques: 1 }).service.void(3, 4, 9, 'motivo'),
    ).rejects.toThrow(/salió en un embarque/);
    await expect(
      conRecepcion({ lote: { netWeight: 400 } }).service.void(
        3,
        4,
        9,
        'motivo',
      ),
    ).rejects.toThrow(/salió en un embarque/);
  });

  it('no anula si el lote tiene una fijación de precio', async () => {
    await expect(
      conRecepcion({ fijaciones: 1 }).service.void(3, 4, 9, 'motivo'),
    ).rejects.toThrow(/fijación de precio/);
  });
});
