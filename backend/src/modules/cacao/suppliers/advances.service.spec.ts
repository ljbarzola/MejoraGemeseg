import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoSupplierAdvancesService } from './advances.service';
import type { CreateAdvanceDto } from './dto/advance.dto';

/** Un anticipo vigente de $100 al proveedor 5 y, por defecto, nada descontado todavía. */
function armar(opciones: { dado?: number; descontado?: number } = {}) {
  const dado = opciones.dado ?? 100;
  const descontado = opciones.descontado ?? 0;
  const dados = [{ supplierId: 5, _sum: { amount: dado } }];
  const descontados =
    descontado > 0 ? [{ supplierId: 5, _sum: { advanceApplied: descontado } }] : [];

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoSupplierAdvance: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn().mockResolvedValue(dados),
    },
    cacaoSettlement: { groupBy: jest.fn().mockResolvedValue(descontados) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoSupplier: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
    cacaoSupplierAdvance: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      groupBy: jest.fn().mockResolvedValue(dados),
    },
    cacaoSettlement: { groupBy: jest.fn().mockResolvedValue(descontados) },
  };
  const service = new CacaoSupplierAdvancesService(
    prisma as unknown as PrismaService,
  );
  return { tx, prisma, service };
}

function dto(over: Partial<CreateAdvanceDto> = {}): CreateAdvanceDto {
  return {
    supplierId: 5,
    date: '2026-11-10',
    amount: 300,
    method: 'TRANSFER',
    ...over,
  };
}

describe('CacaoSupplierAdvancesService.list', () => {
  it('devuelve los movimientos y el saldo del proveedor', async () => {
    const a = armar({ dado: 300, descontado: 100 });
    a.prisma.cacaoSupplierAdvance.findMany.mockResolvedValue([{ id: 1 }]);
    const r = await a.service.list(5, 4);
    expect(r.saldo).toBe(200);
    expect(r.anticipos).toEqual([{ id: 1 }]);
  });

  it('no muestra los anticipos de un proveedor de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(a.service.list(5, 4)).rejects.toThrow(NotFoundException);
    const filtro = a.prisma.cacaoSupplier.findFirst.mock.calls[0][0] as {
      where: { companyId: number };
    };
    expect(filtro.where.companyId).toBe(4);
    expect(a.prisma.cacaoSupplierAdvance.findMany).not.toHaveBeenCalled();
  });
});

describe('CacaoSupplierAdvancesService.create', () => {
  it('registra el anticipo en la empresa, con quién lo hizo y los textos recortados', async () => {
    const a = armar();
    a.prisma.cacaoSupplierAdvance.create.mockResolvedValue({ id: 9 });
    const r = await a.service.create(
      dto({ amount: 150.456, reference: '  TR-77 ', note: '   ' }),
      4,
      12,
    );
    const datos = a.prisma.cacaoSupplierAdvance.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(datos.data).toMatchObject({
      companyId: 4,
      supplierId: 5,
      amount: 150.46, // a 2 decimales
      method: 'TRANSFER',
      reference: 'TR-77',
      note: null, // un texto de solo espacios es «sin dato»
      createdBy: 12,
    });
    expect(r.anticipo).toEqual({ id: 9 });
    expect(typeof r.saldo).toBe('number');
  });

  it('no registra un anticipo a un proveedor de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(a.service.create(dto(), 4, 12)).rejects.toThrow(
      NotFoundException,
    );
    expect(a.prisma.cacaoSupplierAdvance.create).not.toHaveBeenCalled();
  });
});

describe('CacaoSupplierAdvancesService.void', () => {
  const vigente = { id: 3, supplierId: 5, amount: 100, voidedAt: null };

  it('anula un anticipo que todavía no se descontó, con quién y por qué', async () => {
    const a = armar({ dado: 100, descontado: 0 });
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(vigente);
    a.tx.cacaoSupplierAdvance.findUnique.mockResolvedValue(vigente);
    await a.service.void(3, '  se duplicó ', 4, 12);
    expect(a.tx.cacaoSupplierAdvance.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({
        voidedBy: 12,
        voidReason: 'se duplicó',
      }) as unknown,
    });
  });

  it('bloquea al proveedor mientras anula (mismo bloqueo que usa una liquidación)', async () => {
    const a = armar();
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(vigente);
    a.tx.cacaoSupplierAdvance.findUnique.mockResolvedValue(vigente);
    await a.service.void(3, 'error', 4, 12);
    expect(a.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('no anula un anticipo que ya se descontó en una liquidación vigente', async () => {
    // Anticipó 100 y una liquidación ya descontó 80: el saldo es 20 y anular 100 lo dejaría en -80.
    const a = armar({ dado: 100, descontado: 80 });
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(vigente);
    a.tx.cacaoSupplierAdvance.findUnique.mockResolvedValue(vigente);
    await expect(a.service.void(3, 'error', 4, 12)).rejects.toThrow(
      /ya se descontó en una liquidación vigente/,
    );
    expect(a.tx.cacaoSupplierAdvance.update).not.toHaveBeenCalled();
  });

  it('sí anula uno cuando el saldo alcanza (hay otros anticipos sin gastar)', async () => {
    // Anticipó 300 en total y se descontaron 100: el saldo es 200 y anular uno de 100 es posible.
    const a = armar({ dado: 300, descontado: 100 });
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(vigente);
    a.tx.cacaoSupplierAdvance.findUnique.mockResolvedValue(vigente);
    await a.service.void(3, 'error', 4, 12);
    expect(a.tx.cacaoSupplierAdvance.update).toHaveBeenCalled();
  });

  it('no anula dos veces el mismo anticipo', async () => {
    const a = armar();
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(vigente);
    a.tx.cacaoSupplierAdvance.findUnique.mockResolvedValue({
      ...vigente,
      voidedAt: new Date('2026-11-09'),
    });
    await expect(a.service.void(3, 'error', 4, 12)).rejects.toThrow(
      BadRequestException,
    );
    expect(a.tx.cacaoSupplierAdvance.update).not.toHaveBeenCalled();
  });

  it('no toca un anticipo de otra empresa', async () => {
    const a = armar();
    a.tx.cacaoSupplierAdvance.findFirst.mockResolvedValue(null);
    await expect(a.service.void(3, 'error', 4, 12)).rejects.toThrow(
      NotFoundException,
    );
    const filtro = a.tx.cacaoSupplierAdvance.findFirst.mock.calls[0][0] as {
      where: { id: number; companyId: number };
    };
    expect(filtro.where).toEqual({ id: 3, companyId: 4 });
  });
});
