import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoPayablesService } from './payables.service';

function armar() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoPayable: {
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
    cacaoSettlement: { update: jest.fn() },
    cacaoPaymentRequest: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoPayable: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const service = new CacaoPayablesService(prisma as unknown as PrismaService);
  return { tx, prisma, service };
}

const cuenta = {
  id: 1,
  settlementId: 7,
  totalAmount: 1104,
  paidAmount: 0,
  status: 'PENDING',
  settlement: { status: 'APPROVED' },
};
const pago = { amount: 500, method: 'TRANSFER' as const };

describe('CacaoPayablesService.pay', () => {
  it('falla si la cuenta no existe', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(null);
    await expect(service.pay(1, pago, 4, 9)).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['PAID', /Ya está pagada/],
    ['CANCELLED', /fue anulada/],
  ])('no paga una cuenta %s', async (status, mensaje) => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue({ ...cuenta, status });
    await expect(service.pay(1, pago, 4, 9)).rejects.toThrow(mensaje);
  });

  it('no paga si la liquidación no está aprobada', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue({
      ...cuenta,
      settlement: { status: 'PENDING' },
    });
    await expect(service.pay(1, pago, 4, 9)).rejects.toThrow(
      /aún no está aprobada/,
    );
    expect(tx.cacaoPayment.create).not.toHaveBeenCalled();
  });

  it('no deja superar el saldo', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue({ ...cuenta, paidAmount: 700 });
    await expect(
      service.pay(1, { ...pago, amount: 500 }, 4, 9),
    ).rejects.toThrow(/saldo pendiente \(\$404\.00\)/);
    expect(tx.cacaoPayment.create).not.toHaveBeenCalled();
  });

  it('un pago parcial deja la cuenta en PARTIAL y guarda quién pagó', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta);
    await service.pay(1, { ...pago, reference: '  T-1 ' }, 4, 9);
    expect(tx.cacaoPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'PAYMENT',
        amount: 500,
        reference: 'T-1',
        createdBy: 9,
      }),
    });
    expect(tx.cacaoPayable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paidAmount: 500, status: 'PARTIAL' },
    });
    expect(tx.cacaoSettlement.update).not.toHaveBeenCalled();
  });

  it('al saldar la cuenta la liquidación pasa a PAID', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue({ ...cuenta, paidAmount: 604 });
    await service.pay(1, { ...pago, amount: 500 }, 4, 9);
    expect(tx.cacaoPayable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paidAmount: 1104, status: 'PAID' },
    });
    expect(tx.cacaoSettlement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'PAID' },
    });
  });

  it('bloquea la fila de la cuenta dentro de la transacción', async () => {
    const { prisma, tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta);
    await service.pay(1, pago, 4, 9);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('CacaoPayablesService.pay desde una solicitud autorizada', () => {
  it('deja la solicitud pagada y enlazada al pago, en la misma transacción', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta);
    tx.cacaoPayment.create.mockResolvedValue({ id: 55 });
    tx.cacaoPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    await service.pay(1, pago, 4, 9, 12);
    expect(tx.cacaoPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 12, companyId: 4, status: 'AUTHORIZED' },
      data: {
        status: 'PAID',
        paymentId: 55,
        paidBy: 9,
        paidAt: expect.any(Date) as Date,
      },
    });
  });

  it('si la solicitud ya no está autorizada, el pago no se registra', async () => {
    const { tx, prisma, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta);
    tx.cacaoPayment.create.mockResolvedValue({ id: 55 });
    tx.cacaoPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.pay(1, pago, 4, 9, 12)).rejects.toThrow(
      /ya no está autorizada/,
    );
    // El lanzamiento dentro de la transacción la revierte: la cuenta no se actualiza.
    expect(tx.cacaoPayable.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('CacaoPayablesService.voidPayment', () => {
  const registrado = { id: 3, payableId: 1, amount: 500, voidedAt: null };

  it('falla si el pago no existe', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(null);
    await expect(service.voidPayment(3, 'error', 4, 9)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('no anula dos veces el mismo pago', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(registrado);
    tx.cacaoPayment.findUnique.mockResolvedValue({
      ...registrado,
      voidedAt: new Date(),
    });
    await expect(service.voidPayment(3, 'error', 4, 9)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('devuelve el saldo y deja la cuenta pendiente si no quedan pagos', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(registrado);
    tx.cacaoPayment.findUnique.mockResolvedValue(registrado);
    tx.cacaoPayable.findUniqueOrThrow.mockResolvedValue({
      ...cuenta,
      paidAmount: 500,
      status: 'PARTIAL',
    });
    await service.voidPayment(3, '  me equivoqué ', 4, 9);
    expect(tx.cacaoPayment.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({
        voidedBy: 9,
        voidReason: 'me equivoqué',
      }),
    });
    expect(tx.cacaoPayable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paidAmount: 0, status: 'PENDING' },
    });
    expect(tx.cacaoSettlement.update).not.toHaveBeenCalled();
  });

  it('si la cuenta estaba pagada, la liquidación vuelve a APPROVED', async () => {
    const { tx, service } = armar();
    tx.cacaoPayment.findFirst.mockResolvedValue(registrado);
    tx.cacaoPayment.findUnique.mockResolvedValue(registrado);
    tx.cacaoPayable.findUniqueOrThrow.mockResolvedValue({
      ...cuenta,
      paidAmount: 1104,
      status: 'PAID',
    });
    await service.voidPayment(3, 'error', 4, 9);
    expect(tx.cacaoPayable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paidAmount: 604, status: 'PARTIAL' },
    });
    expect(tx.cacaoSettlement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'APPROVED' },
    });
  });
});
