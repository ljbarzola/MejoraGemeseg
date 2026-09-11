import { ProjectsService } from './projects.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

describe('ProjectsService.findAll', () => {
  let service: ProjectsService;
  let prisma: {
    project: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  // Bug real: un EMPLOYEE con companyId (el caso normal) veía todos los
  // proyectos creados por cualquiera en su empresa, sin importar si era
  // miembro — el chequeo de companyId iba antes que el de rol y capturaba
  // también a los no-admin. Ver AGENTS.md/.agents/modules/projects.md:
  // "Listar proyectos (filtrado por membresia)".
  it('EMPLOYEE con companyId solo ve proyectos propios o donde es miembro, scoped a su empresa', async () => {
    await service.findAll(42, UserRole.EMPLOYEE, 1, {});

    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdById: 42 },
      { members: { some: { userId: 42 } } },
    ]);
    expect(where.createdBy).toEqual({ companyId: 1 });
  });

  it('MANAGER con companyId también queda scoped a membresia (no solo ADMIN)', async () => {
    await service.findAll(7, UserRole.MANAGER, 1, {});

    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdById: 7 },
      { members: { some: { userId: 7 } } },
    ]);
  });

  it('ADMIN ve todos los proyectos de su empresa, sin filtro de membresia', async () => {
    await service.findAll(1, UserRole.ADMIN, 1, {});

    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.createdBy).toEqual({ companyId: 1 });
    expect(where.OR).toBeUndefined();
  });

  it('super-admin (companyId null) ADMIN ve todo, sin ningún filtro de empresa', async () => {
    await service.findAll(1, UserRole.ADMIN, null, {});

    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.createdBy).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it('aplica el filtro de status además del de membresia', async () => {
    await service.findAll(42, UserRole.EMPLOYEE, 1, {
      status: 'ACTIVO',
    } as any);

    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVO');
  });
});
