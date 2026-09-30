import * as fs from 'fs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CPContratosService } from './contratos.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('fs');

function makeContrato(overrides: Partial<any> = {}) {
  return {
    id: 1,
    companyId: 1,
    entidadId: 1,
    numero: 'OC-001',
    objeto: 'Servicio de seguridad',
    referenciaProceso: 'SERCOP-123',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    valorTotal: 100000,
    estado: 'ACTIVO',
    contratoOrigenId: null,
    createdBy: 1,
    ...overrides,
  };
}

describe('CPContratosService', () => {
  let service: CPContratosService;
  let prisma: {
    cPContrato: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    cPEntidadPublica: { findFirst: jest.Mock };
    cPContratoAdenda: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    cPContratoAdjunto: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

    prisma = {
      cPContrato: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      cPEntidadPublica: { findFirst: jest.fn() },
      cPContratoAdenda: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      cPContratoAdjunto: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CPContratosService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects when the entidad does not belong to the company', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            entidadId: 1,
            numero: 'OC-001',
            objeto: 'Objeto',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-12-31',
          } as any,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cPContrato.create).not.toHaveBeenCalled();
    });

    it('rejects when fechaFin is before fechaInicio', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.create(
          {
            entidadId: 1,
            numero: 'OC-001',
            objeto: 'Objeto',
            fechaInicio: '2026-12-31',
            fechaFin: '2026-01-01',
          } as any,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPContrato.create).not.toHaveBeenCalled();
    });

    it('creates the contrato scoped to the company', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue({ id: 1 });
      prisma.cPContrato.create.mockResolvedValue(makeContrato());

      await service.create(
        {
          entidadId: 1,
          numero: 'OC-001',
          objeto: 'Objeto',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-12-31',
        },
        1,
        1,
      );

      expect(prisma.cPContrato.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 1, createdBy: 1 }),
        }),
      );
    });
  });

  describe('renovar', () => {
    it('throws NotFoundException when the original contrato is not found', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue(null);

      await expect(
        service.renovar(
          1,
          {
            numero: 'OC-002',
            fechaInicio: '2027-01-01',
            fechaFin: '2027-12-31',
          } as any,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a new contrato pointing at the original via contratoOrigenId', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue(makeContrato());
      prisma.cPContrato.create.mockResolvedValue(makeContrato({ id: 2 }));

      await service.renovar(
        1,
        {
          numero: 'OC-002',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-12-31',
        },
        1,
        1,
      );

      expect(prisma.cPContrato.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contratoOrigenId: 1,
            numero: 'OC-002',
            objeto: 'Servicio de seguridad', // heredado del original
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting when not found', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cPContrato.delete).not.toHaveBeenCalled();
    });
  });

  describe('addAdjunto', () => {
    it('rejects when no file is provided', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue(makeContrato());

      await expect(
        service.addAdjunto(1, 1, undefined as any, 'CONTRATO'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPContratoAdjunto.create).not.toHaveBeenCalled();
    });
  });
});
