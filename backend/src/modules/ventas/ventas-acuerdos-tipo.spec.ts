import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasAcuerdosService } from './ventas-acuerdos.service';
import type { VentasMotivosService } from './ventas-motivos.service';

// Cambiar el tipo de un contrato al editarlo (2026-10-22): uno creado antes de que existiera «Venta única»
// quedaba como servicio sin remedio.
describe('VentasAcuerdosService — cambiar el tipo del contrato', () => {
  let prisma: any;
  let servicio: VentasAcuerdosService;

  const contrato = (extra: Record<string, unknown> = {}) => ({
    id: 5,
    salesClientId: 9,
    kind: 'SERVICIO',
    status: 'ACTIVO',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2027-10-01T00:00:00.000Z'),
    warrantyUntil: null,
    renewedFromId: null,
    services: [{ serviceId: 1 }],
    ...extra,
  });

  beforeEach(() => {
    const tx = {
      salesAgreement: { update: jest.fn().mockResolvedValue({}) },
      salesAgreementService: { deleteMany: jest.fn(), createMany: jest.fn() },
      salesClientActivity: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      salesAgreement: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      salesOpportunity: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      tx,
    };
    servicio = new VentasAcuerdosService(prisma as unknown as PrismaService, {} as unknown as VentasMotivosService);
    jest.spyOn(servicio, 'getAgreement').mockResolvedValue({ id: 5 } as unknown as never);
  });

  it('un servicio pasa a producto: sin fin ni valor mensual y «Por entregar», con una nota en el historial', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(contrato());
    await servicio.updateAgreement(1, 7, 5, { kind: 'PRODUCTO', startDate: '2026-10-01', totalValue: 450 });
    const data = prisma.tx.salesAgreement.update.mock.calls[0][0].data;
    expect(data.kind).toBe('PRODUCTO');
    expect(data.endDate).toBeNull();
    expect(data.monthlyValue).toBeNull();
    expect(data.status).toBe('POR_ENTREGAR');
    expect(prisma.tx.salesClientActivity.create).toHaveBeenCalledTimes(1);
  });

  it('un producto pasa a servicio: sin garantía ni valor total, activo y con días de gracia sugeridos', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(
      contrato({ kind: 'PRODUCTO', status: 'ENTREGADO', endDate: null, warrantyUntil: new Date('2027-01-01T00:00:00.000Z') }),
    );
    await servicio.updateAgreement(1, 7, 5, { kind: 'SERVICIO', endDate: '2027-10-01' });
    const data = prisma.tx.salesAgreement.update.mock.calls[0][0].data;
    expect(data.kind).toBe('SERVICIO');
    expect(data.warrantyUntil).toBeNull();
    expect(data.totalValue).toBeNull();
    expect(data.status).toBe('ACTIVO');
    expect(data.graceDays).toBe(30);
  });

  it('un contrato cancelado conserva su estado al cambiar de tipo', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(contrato({ status: 'CANCELADO' }));
    await servicio.updateAgreement(1, 7, 5, { kind: 'PRODUCTO', startDate: '2026-10-01' });
    expect(prisma.tx.salesAgreement.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('un contrato que ya forma parte de una renovación no puede ser producto', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(contrato({ renewedFromId: 2 }));
    await expect(servicio.updateAgreement(1, 7, 5, { kind: 'PRODUCTO', startDate: '2026-10-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un contrato con oportunidad de renovación tampoco', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(contrato());
    prisma.salesOpportunity.count.mockResolvedValue(1);
    await expect(servicio.updateAgreement(1, 7, 5, { kind: 'PRODUCTO', startDate: '2026-10-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('editar otro dato sin mandar el tipo no toca el tipo ni deja nota', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(contrato());
    await servicio.updateAgreement(1, 7, 5, { title: 'Nuevo título' });
    const data = prisma.tx.salesAgreement.update.mock.calls[0][0].data;
    expect(data.kind).toBeUndefined();
    expect(prisma.tx.salesClientActivity.create).not.toHaveBeenCalled();
  });
});
