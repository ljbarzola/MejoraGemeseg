import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoReceivablesService } from './receivables.service';

function armar() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoReceivable: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    cacaoPayment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    cacaoShipment: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoReceivable: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
  const service = new CacaoReceivablesService(
    prisma as unknown as PrismaService,
  );
  return { tx, service };
}

const cuenta = {
  id: 1,
  shipmentId: 8,
  totalAmount: 2250,
  receivedAmount: 0,
  status: 'PENDING',
};
const cobro = { amount: 1000, method: 'TRANSFER' as const };

describe('CacaoReceivablesService.receive', () => {
  it('falla si la cuenta no existe', async () => {
    const { tx, service } = armar();
    tx.cacaoReceivable.findFirst.mockResolvedValue(null);
    await expect(service.receive(1, cobro, 4, 9)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('no cobra una cuenta ya cobrada', async () => {
    const { tx, service } = armar();
    tx.cacaoReceivable.findFirst.mockResolvedValue({
      ...cuenta,
      status: 'RECEIVED',
    });
    await expect(service.receive(1, cobro, 4, 9)).rejects.toThrow(
      /Ya está cobrada/,
    );
  });

  it('no deja superar el saldo', async () => {
    const { tx, service } = armar();
    tx.cacaoReceivable.findFirst.mockResolvedValue({
      ...cuenta,
      receivedAmount: 1500,
    });
    await expect(service.receive(1, cobro, 4, 9)).rejects.toThrow(
      /saldo pendiente \(\$750\.00\)/,
    );
  });

  it('un cobro parcial deja la cuenta en PARTIAL', async () => {
    const { tx, service } = armar();
    tx.cacaoReceivable.findFirst.mockResolvedValue(cuenta);
    await service.receive(1, cobro, 4, 9);
    expect(tx.cacaoPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'RECEIPT', createdBy: 9 }),
    });
    expect(tx.cacaoReceivable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { receivedAmount: 1000, status: 'PARTIAL' },
    });
    expect(tx.cacaoShipment.update).not.toHaveBeenCalled();
  });

  it('al cobrar todo, el embarque pasa a COMPLETED en la misma transacción', async () => {
    const { tx, service } = armar();
    tx.cacaoReceivable.findFirst.mockResolvedValue({
      ...cuenta,
      receivedAmount: 1250,
    });
    await service.receive(1, cobro, 4, 9);
    expect(tx.cacaoReceivable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { receivedAmount: 2250, status: 'RECEIVED' },
    });
    expect(tx.cacaoShipment.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { status: 'COMPLETED' },
    });
  });
});

describe('CacaoReceivablesService.voidReceipt', () => {
  const registrado = { id: 3, receivableId: 1, amount: 1000, voidedAt: null };

  it('no anula dos veces el mismo cobro', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(registrado);
    tx.cacaoPayment.findUnique.mockResolvedValue({
      ...registrado,
      voidedAt: new Date(),
    });
    await expect(service.voidReceipt(3, 'error', 4, 9)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('si estaba cobrada, el embarque vuelve a PENDING', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(registrado);
    tx.cacaoPayment.findUnique.mockResolvedValue(registrado);
    tx.cacaoReceivable.findUniqueOrThrow.mockResolvedValue({
      ...cuenta,
      receivedAmount: 2250,
      status: 'RECEIVED',
    });
    await service.voidReceipt(3, 'error', 4, 9);
    expect(tx.cacaoReceivable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { receivedAmount: 1250, status: 'PARTIAL' },
    });
    expect(tx.cacaoShipment.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { status: 'PENDING' },
    });
  });
});
