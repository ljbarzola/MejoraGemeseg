import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustodiasService } from './custodias.service';
import { PrismaService } from '../../prisma/prisma.service';

function makeCustodia(overrides: Partial<any> = {}) {
  return {
    id: 1,
    numeroGuia: 'G-001',
    tipoCustodia: 'HACIENDA',
    estado: 'LLEGO',
    choferName: 'Juan Chofer',
    choferCedula: '1111111111',
    custodio1Name: 'Ana Custodio',
    custodio1Cedula: '2222222222',
    custodio2Name: 'Luis Custodio',
    custodio2Cedula: '3333333333',
    cliente: 'Cliente X',
    placa: 'ABC-123',
    direccionSalida: 'Origen',
    direccionLlegada: 'Destino',
    fechaHoraSalida: new Date('2026-08-01T10:00:00Z'),
    fechaHoraLlegada: new Date('2026-08-01T14:00:00Z'),
    createdAt: new Date('2026-08-01T09:00:00Z'),
    companyId: 1,
    ...overrides,
  };
}

describe('CustodiasService', () => {
  let service: CustodiasService;
  let prisma: {
    custodia: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    employeeDriveFolder: { findMany: jest.Mock; findFirst: jest.Mock };
    candidate: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      custodia: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      employeeDriveFolder: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      candidate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    service = new CustodiasService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects a duplicate numeroGuia', async () => {
      prisma.custodia.findUnique.mockResolvedValue(makeCustodia());

      await expect(
        service.create(
          { numeroGuia: 'G-001', tipoCustodia: 'hacienda' } as any,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.create).not.toHaveBeenCalled();
    });

    it('normalizes tipoCustodia to upper snake case', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      prisma.custodia.create.mockResolvedValue(makeCustodia());

      await service.create(
        {
          numeroGuia: 'G-002',
          tipoCustodia: 'puerto viejo',
          choferName: 'Chofer',
          custodio1Name: 'C1',
          custodio2Name: 'C2',
        },
        1,
        1,
      );

      expect(prisma.custodia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipoCustodia: 'PUERTO_VIEJO' }),
        }),
      );
    });
  });

  describe('updateEstado', () => {
    it('rejects an invalid estado without touching the database', async () => {
      await expect(
        service.updateEstado(1, 'EN_PROCESO', 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.findFirst).not.toHaveBeenCalled();
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the custodia does not belong to the company', async () => {
      prisma.custodia.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEstado(1, 'EN_CAMINO', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('updates the estado when the custodia exists', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia());
      prisma.custodia.update.mockResolvedValue(
        makeCustodia({ estado: 'EN_CAMINO' }),
      );

      const result = await service.updateEstado(1, 'EN_CAMINO', 1);

      expect(prisma.custodia.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { estado: 'EN_CAMINO' },
      });
      expect(result.estado).toBe('EN_CAMINO');
    });
  });

  describe('getNomina', () => {
    it('only pays custodias in estado LLEGO, at the full per-person rate', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA', estado: 'LLEGO' }),
        makeCustodia({ id: 2, tipoCustodia: 'PUERTO', estado: 'EN_CAMINO' }),
      ]);

      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');

      expect(nomina.resumen.total_custodias).toBe(1);
      expect(nomina.resumen.total_pagado).toBe(60); // 3 people x $20 (HACIENDA)
      expect(nomina.empleados).toHaveLength(3);
      expect(nomina.empleados.every((e) => e.total_usd === 20)).toBe(true);
    });

    it('splits pay per trip role when the same person appears twice', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({
          id: 1,
          tipoCustodia: 'VIP',
          estado: 'LLEGO',
          choferCedula: '1111111111',
          custodio1Cedula: '1111111111',
          custodio1Name: 'Juan Chofer',
        }),
      ]);

      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');
      const juan = nomina.empleados.find((e) => e.cedula === '1111111111');

      expect(juan?.total_viajes).toBe(2);
      expect(juan?.total_usd).toBe(46); // 2 x $23 (VIP)
    });
  });

  describe('getDashboardStats', () => {
    it('counts every custodia por estado but only totals nomina for finalizadas', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA', estado: 'LLEGO' }),
        makeCustodia({ id: 2, tipoCustodia: 'PUERTO', estado: 'EN_CAMINO' }),
        makeCustodia({
          id: 3,
          tipoCustodia: 'VIP',
          estado: 'LISTO_PARA_CUSTODIAR',
        }),
      ]);

      const stats = await service.getDashboardStats(1, '2026-08');

      expect(stats.kpis.total_viajes).toBe(3);
      expect(stats.kpis.viajes_finalizados).toBe(1);
      expect(stats.kpis.total_nomina_usd).toBe(60); // only the LLEGO HACIENDA trip, x3 people
      expect(stats.por_estado).toEqual(
        expect.arrayContaining([
          { estado: 'LISTO_PARA_CUSTODIAR', cantidad: 1 },
          { estado: 'EN_CAMINO', cantidad: 1 },
          { estado: 'LLEGO', cantidad: 1 },
        ]),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting when the custodia is not found', async () => {
      prisma.custodia.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.custodia.delete).not.toHaveBeenCalled();
    });
  });
});
