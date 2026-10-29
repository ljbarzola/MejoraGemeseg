import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CacaoConfigService } from '../config/cacao-config.service';
import type { CacaoPayablesService } from './payables.service';
import { CacaoPaymentRequestsService } from './payment-requests.service';

function armar(exige = true) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cacaoPayable: { findFirst: jest.fn() },
    cacaoPaymentRequest: { aggregate: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    cacaoPaymentRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const config = {
    pagosRequierenAutorizacion: jest.fn().mockResolvedValue(exige),
  };
  const payables = { pay: jest.fn().mockResolvedValue({}) };
  const service = new CacaoPaymentRequestsService(
    prisma as unknown as PrismaService,
    config as unknown as CacaoConfigService,
    payables as unknown as CacaoPayablesService,
  );
  return { tx, prisma, config, payables, service };
}

const cuenta = {
  id: 1,
  totalAmount: 1000,
  paidAmount: 200,
  status: 'PARTIAL',
  settlement: { status: 'APPROVED' },
};
const pedido = { amount: 300, method: 'TRANSFER' as const };

describe('CacaoPaymentRequestsService.asegurarPagoDirecto', () => {
  it('deja pagar directo si la empresa no exige autorización', async () => {
    const { service } = armar(false);
    await expect(service.asegurarPagoDirecto(4)).resolves.toBeUndefined();
  });

  it('cierra el pago directo si la empresa exige autorización', async () => {
    const { service } = armar(true);
    await expect(service.asegurarPagoDirecto(4)).rejects.toThrow(
      /exige autorización/,
    );
  });
});

describe('CacaoPaymentRequestsService.create', () => {
  it('no se piden pagos si la empresa paga directo', async () => {
    const { service, prisma } = armar(false);
    await expect(service.create(1, pedido, 4, 9)).rejects.toThrow(
      /paga directo/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falla si la cuenta no existe en la empresa', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(null);
    await expect(service.create(1, pedido, 4, 9)).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each([
    ['PAID', {}, /Ya está pagada/],
    ['CANCELLED', {}, /fue anulada/],
    ['PENDING', { settlement: { status: 'PENDING' } }, /aún no está aprobada/],
  ])('no se pide pago de una cuenta %s', async (status, extra, mensaje) => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue({
      ...cuenta,
      status,
      ...extra,
    });
    await expect(service.create(1, pedido, 4, 9)).rejects.toThrow(mensaje);
  });

  it('descuenta del saldo lo que ya está pedido o autorizado', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta); // saldo 800
    tx.cacaoPaymentRequest.aggregate.mockResolvedValue({
      _sum: { amount: 600 },
    });
    // Quedan 200 libres y se piden 300.
    await expect(service.create(1, pedido, 4, 9)).rejects.toThrow(/\$200\.00/);
    expect(tx.cacaoPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('crea la solicitud con quien la pidió, con la cuenta bloqueada', async () => {
    const { tx, service } = armar();
    tx.cacaoPayable.findFirst.mockResolvedValue(cuenta);
    tx.cacaoPaymentRequest.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    tx.cacaoPaymentRequest.create.mockResolvedValue({ id: 1 });
    await service.create(1, { ...pedido, reference: ' T-9 ' }, 4, 9);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.cacaoPaymentRequest.create).toHaveBeenCalledWith({
      data: {
        companyId: 4,
        payableId: 1,
        amount: 300,
        method: 'TRANSFER',
        reference: 'T-9',
        requestedBy: 9,
      },
    });
  });
});

describe('CacaoPaymentRequestsService.authorize', () => {
  it('no la autoriza quien la pidió', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
      requestedBy: 9,
    });
    await expect(service.authorize(1, 4, 9)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.cacaoPaymentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('solo se autoriza una solicitud pendiente', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'PAID',
      requestedBy: 9,
    });
    await expect(service.authorize(1, 4, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('autoriza otra persona y queda registrado quién y cuándo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
      requestedBy: 9,
    });
    await service.authorize(1, 4, 5);
    expect(prisma.cacaoPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 1, companyId: 4, status: 'REQUESTED' },
      data: {
        status: 'AUTHORIZED',
        decidedBy: 5,
        decidedAt: expect.any(Date) as Date,
      },
    });
  });

  it('si otra persona la decidió a la vez, avisa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
      requestedBy: 9,
    });
    prisma.cacaoPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.authorize(1, 4, 5)).rejects.toThrow(/ya fue decidida/);
  });
});

describe('CacaoPaymentRequestsService.reject y cancel', () => {
  it('quien la pidió no la rechaza (la cancela)', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
      requestedBy: 9,
    });
    await expect(service.reject(1, 4, 9, 'no')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechazar guarda el motivo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
      requestedBy: 9,
    });
    await service.reject(1, 4, 5, '  Monto errado ');
    expect(prisma.cacaoPaymentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          decisionReason: 'Monto errado',
        }) as object,
      }),
    );
  });

  it('cancela quien la pidió o un administrador, no un tercero', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'AUTHORIZED',
      requestedBy: 9,
    });
    await expect(service.cancel(1, 4, 5, false)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.cancel(1, 4, 9, false)).resolves.toBeDefined();
    await expect(service.cancel(1, 4, 5, true)).resolves.toBeDefined();
  });

  it('una solicitud ya pagada no se cancela', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'PAID',
      requestedBy: 9,
    });
    await expect(service.cancel(1, 4, 9, true)).rejects.toThrow(
      /aún no se pagó/,
    );
  });
});

describe('CacaoPaymentRequestsService.pay', () => {
  it('solo paga una solicitud autorizada', async () => {
    const { prisma, payables, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'REQUESTED',
    });
    await expect(service.pay(1, 4, 9)).rejects.toThrow(/autorizada/);
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'PAID',
    });
    await expect(service.pay(1, 4, 9)).rejects.toThrow(/ya se pagó/);
    expect(payables.pay).not.toHaveBeenCalled();
  });

  it('paga con los datos autorizados y enlaza la solicitud con el pago', async () => {
    const { prisma, payables, service } = armar();
    prisma.cacaoPaymentRequest.findFirst.mockResolvedValue({
      id: 1,
      status: 'AUTHORIZED',
      payableId: 7,
      amount: 300,
      method: 'CHECK',
      reference: 'CH-1',
    });
    await service.pay(1, 4, 9);
    expect(payables.pay).toHaveBeenCalledWith(
      7,
      { amount: 300, method: 'CHECK', reference: 'CH-1' },
      4,
      9,
      1,
    );
  });
});
