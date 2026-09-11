import { CumplimientoEntidadService } from './cumplimiento-entidad.service';
import { DriveService } from './drive.service';
import { MovimientoPersonalService } from './movimiento-personal.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('googleapis');

describe('CumplimientoEntidadService.getComplianceForGuardia', () => {
  let service: CumplimientoEntidadService;
  let prisma: {
    asignacionGuardia: { findFirst: jest.Mock };
    entidad: { findFirst: jest.Mock };
    requisitoDocumento: { findMany: jest.Mock };
    employeeDocument: { findMany: jest.Mock };
  };

  const entidad = { id: 1, nombre: 'Banco Pichincha', tipo: 'PRIVADA' };
  const asignacion = {
    id: 10,
    cedula: '0912345678',
    entidadId: 1,
    entidad,
    fechaFin: null,
  };

  const requisito = (over: any = {}) => ({
    id: 1,
    nombre: 'Certificado médico',
    aplicaA: 'GLOBAL',
    entidadId: null,
    duracionValor: null,
    duracionUnidad: null,
    anticipacionValor: 30,
    anticipacionUnidad: 'DIAS',
    ...over,
  });

  const documento = (over: any = {}) => ({
    id: 5,
    fileName: 'Certificado médico.pdf',
    fileUrl: 'https://drive/5',
    driveFileId: 'drive-5',
    issueDate: null,
    expiryDate: null,
    createdAt: new Date('2026-09-01'),
    ...over,
  });

  beforeEach(() => {
    prisma = {
      asignacionGuardia: { findFirst: jest.fn().mockResolvedValue(asignacion) },
      entidad: { findFirst: jest.fn().mockResolvedValue(entidad) },
      requisitoDocumento: {
        findMany: jest.fn().mockResolvedValue([requisito()]),
      },
      employeeDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const driveService = new DriveService(
      {} as unknown as PrismaService,
      {} as unknown as MovimientoPersonalService,
    );
    const movimientoPersonalService = {
      getCedulasFuera: jest.fn().mockResolvedValue([]),
    };
    service = new CumplimientoEntidadService(
      prisma as unknown as PrismaService,
      driveService,
      movimientoPersonalService as unknown as MovimientoPersonalService,
    );
  });

  it('reporta sin asignación cuando el guardia no tiene una activa', async () => {
    prisma.asignacionGuardia.findFirst.mockResolvedValue(null);
    const result = await service.getComplianceForGuardia(1, '0912345678');
    expect(result.tieneAsignacion).toBe(false);
    expect(result.requisitos).toEqual([]);
  });

  it('marca FALTANTE cuando no hay documento que matchee', async () => {
    const result = await service.getComplianceForGuardia(1, '0912345678');
    expect(result.requisitos[0].estado).toBe('FALTANTE');
  });

  it('nunca marca VENCIDO/POR_VENCER un requisito configurado como "no vence", aunque el documento tenga una expiryDate extraída por Drive', async () => {
    prisma.requisitoDocumento.findMany.mockResolvedValue([
      requisito({ duracionValor: null, duracionUnidad: null }),
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      documento({ expiryDate: new Date('2020-01-01') }), // muy vencida si se tomara en cuenta
    ]);

    const result = await service.getComplianceForGuardia(1, '0912345678');

    expect(result.requisitos[0].estado).toBe('CUMPLIDO');
  });

  it('marca VENCIDO cuando el requisito sí vence y el documento ya pasó su expiryDate', async () => {
    prisma.requisitoDocumento.findMany.mockResolvedValue([
      requisito({ duracionValor: 1, duracionUnidad: 'ANIOS' }),
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      documento({ expiryDate: new Date('2020-01-01') }),
    ]);

    const result = await service.getComplianceForGuardia(1, '0912345678');

    expect(result.requisitos[0].estado).toBe('VENCIDO');
  });

  it('marca POR_VENCER cuando el requisito vence y está dentro de la ventana de anticipación', async () => {
    const pronto = new Date();
    pronto.setDate(pronto.getDate() + 5); // dentro de la ventana de 30 días
    prisma.requisitoDocumento.findMany.mockResolvedValue([
      requisito({
        duracionValor: 1,
        duracionUnidad: 'ANIOS',
        anticipacionValor: 30,
        anticipacionUnidad: 'DIAS',
      }),
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      documento({ expiryDate: pronto }),
    ]);

    const result = await service.getComplianceForGuardia(1, '0912345678');

    expect(result.requisitos[0].estado).toBe('POR_VENCER');
  });

  it('marca CUMPLIDO cuando el requisito vence pero falta mucho para el vencimiento', async () => {
    const lejos = new Date();
    lejos.setFullYear(lejos.getFullYear() + 5);
    prisma.requisitoDocumento.findMany.mockResolvedValue([
      requisito({
        duracionValor: 1,
        duracionUnidad: 'ANIOS',
        anticipacionValor: 30,
        anticipacionUnidad: 'DIAS',
      }),
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      documento({ expiryDate: lejos }),
    ]);

    const result = await service.getComplianceForGuardia(1, '0912345678');

    expect(result.requisitos[0].estado).toBe('CUMPLIDO');
  });
});

describe('CumplimientoEntidadService.getComplianceOverview', () => {
  const asignacionA = {
    id: 1,
    cedula: 'A',
    nombreGuardia: 'Guardia A',
    entidadId: 1,
    entidad: { id: 1, nombre: 'Entidad 1', tipo: 'PRIVADA' },
    fechaFin: null,
  };
  const asignacionB = {
    id: 2,
    cedula: 'B',
    nombreGuardia: 'Guardia B',
    entidadId: 1,
    entidad: { id: 1, nombre: 'Entidad 1', tipo: 'PRIVADA' },
    fechaFin: null,
  };

  it('excluye de la lista a los guardias cuya salida ya se completó, aunque su AsignacionGuardia siga activa', async () => {
    const prisma = {
      asignacionGuardia: {
        findMany: jest.fn().mockResolvedValue([asignacionA, asignacionB]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      entidad: { findFirst: jest.fn().mockResolvedValue(asignacionA.entidad) },
      requisitoDocumento: { findMany: jest.fn().mockResolvedValue([]) },
      employeeDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const driveService = new DriveService(
      {} as unknown as PrismaService,
      {} as unknown as MovimientoPersonalService,
    );
    // Solo 'B' está "fuera" (última SALIDA completada) — 'A' sigue activo.
    const movimientoPersonalService = {
      getCedulasFuera: jest.fn().mockResolvedValue(['B']),
    };
    const service = new CumplimientoEntidadService(
      prisma as unknown as PrismaService,
      driveService,
      movimientoPersonalService as unknown as MovimientoPersonalService,
    );

    const overview = await service.getComplianceOverview(1);

    expect(overview.map((o) => o.asignacion.cedula)).toEqual(['A']);
  });
});
