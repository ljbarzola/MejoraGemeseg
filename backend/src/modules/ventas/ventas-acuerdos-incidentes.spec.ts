import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasAcuerdosService } from './ventas-acuerdos.service';
import type { VentasMotivosService } from './ventas-motivos.service';

// Incidentes del servicio y conversación de salida POR CONTRATO (2026-10-18).
describe('VentasAcuerdosService — incidentes del contrato', () => {
  let prisma: any;
  let servicio: VentasAcuerdosService;

  beforeEach(() => {
    prisma = {
      salesAgreement: { findFirst: jest.fn() },
      salesAgreementIncident: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesReasonEntry: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    servicio = new VentasAcuerdosService(
      prisma as unknown as PrismaService,
      {} as unknown as VentasMotivosService,
    );
    // El contrato existe; getAgreement se prueba aparte, aquí solo importa lo que se guarda.
    jest
      .spyOn(servicio, 'getAgreement')
      .mockResolvedValue({ id: 1 } as unknown as never);
    prisma.salesAgreement.findFirst.mockResolvedValue({ id: 1 });
  });

  it('guarda un incidente con su fecha y quién lo anotó', async () => {
    await servicio.crearIncidente(1, 7, 1, {
      type: 'INCIDENTE_SERVICIO',
      text: '  El guardia no llegó  ',
      date: '2026-10-10',
    });
    expect(prisma.salesAgreementIncident.create).toHaveBeenCalledWith({
      data: {
        companyId: 1,
        agreementId: 1,
        type: 'INCIDENTE_SERVICIO',
        occurredAt: new Date('2026-10-10T00:00:00.000Z'),
        text: 'El guardia no llegó',
        createdBy: 7,
      },
    });
  });

  it('rechaza un tipo que no es incidente ni conversación de salida', async () => {
    await expect(
      servicio.crearIncidente(1, 7, 1, { type: 'NOTA', text: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.salesAgreementIncident.create).not.toHaveBeenCalled();
  });

  it('rechaza texto vacío y fechas futuras o inválidas', async () => {
    await expect(
      servicio.crearIncidente(1, 7, 1, { type: 'CONVERSACION_SALIDA', text: '   ' }),
    ).rejects.toThrow('Escribe qué pasó');
    await expect(
      servicio.crearIncidente(1, 7, 1, {
        type: 'INCIDENTE_SERVICIO',
        text: 'x',
        date: '2099-01-01',
      }),
    ).rejects.toThrow('no puede ser futura');
    await expect(
      servicio.crearIncidente(1, 7, 1, {
        type: 'INCIDENTE_SERVICIO',
        text: 'x',
        date: '31/12/2020',
      }),
    ).rejects.toThrow('no es válida');
  });

  it('no deja anotar en un contrato de otra empresa', async () => {
    prisma.salesAgreement.findFirst.mockResolvedValue(null);
    await expect(
      servicio.crearIncidente(1, 7, 99, { type: 'INCIDENTE_SERVICIO', text: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrar filtra por empresa y contrato, y avisa si no existe', async () => {
    prisma.salesAgreementIncident.deleteMany.mockResolvedValue({ count: 0 });
    await expect(servicio.borrarIncidente(1, 1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.salesAgreementIncident.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, agreementId: 1, companyId: 1 },
    });
  });
});
