import { ALL_SECTIONS, PermissionsService } from './permissions.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: {
    companySection: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    userPermission: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      companySection: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      userPermission: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      user: { findMany: jest.fn() },
    };
    service = new PermissionsService(prisma as unknown as PrismaService);
  });

  describe('isSuperAdmin', () => {
    it('is true only for an ADMIN with no companyId', () => {
      expect(service.isSuperAdmin({ role: 'ADMIN', companyId: null })).toBe(
        true,
      );
      expect(service.isSuperAdmin({ role: 'ADMIN', companyId: 1 })).toBe(false);
      expect(service.isSuperAdmin({ role: 'EMPLOYEE', companyId: null })).toBe(
        false,
      );
    });
  });

  describe('getCompanySections', () => {
    it('always enables alwaysEnabled sections regardless of the DB rows', async () => {
      prisma.companySection.findMany.mockResolvedValue([]);

      const sections = await service.getCompanySections(1);

      const dashboard = sections.find((s) => s.key === 'DASHBOARD');
      const cacao = sections.find((s) => s.key === 'CACAO');
      expect(dashboard?.enabled).toBe(true);
      expect(cacao?.enabled).toBe(false);
    });

    it('enables a non-default section once it is present in the DB', async () => {
      prisma.companySection.findMany.mockResolvedValue([{ section: 'CACAO' }]);

      const sections = await service.getCompanySections(1);

      expect(sections.find((s) => s.key === 'CACAO')?.enabled).toBe(true);
      expect(sections.find((s) => s.key === 'VENTAS')?.enabled).toBe(false);
    });
  });

  describe('setCompanySections', () => {
    it('persists always-enabled sections even if the caller does not request them', async () => {
      prisma.companySection.findMany.mockResolvedValue([]);

      await service.setCompanySections(1, ['CACAO']);

      // Solo se borran las que SALEN, no todas: borrar y recrear todo perdía
      // el marcador `fixedForAll` de cada sección en cada guardado.
      expect(prisma.companySection.deleteMany).toHaveBeenCalledWith({
        where: { companyId: 1, section: { notIn: expect.any(Array) } },
      });
      const borradas = (prisma.companySection.deleteMany as jest.Mock).mock
        .calls[0][0].where.section.notIn as string[];
      expect(borradas).toContain('CACAO');
      const createMany = prisma.companySection.createMany as jest.Mock<
        unknown,
        [{ data: { section: string }[] }]
      >;
      const persistedKeys = createMany.mock.calls[0][0].data.map(
        (d) => d.section,
      );

      const alwaysOnKeys = ALL_SECTIONS.filter((s) => s.alwaysEnabled).map(
        (s) => s.key,
      );
      for (const key of alwaysOnKeys) {
        expect(persistedKeys).toContain(key);
      }
      expect(persistedKeys).toContain('CACAO');
      expect(new Set(persistedKeys).size).toBe(persistedKeys.length); // deduped
    });
  });

  describe('getMyPermissions', () => {
    it('gives the super admin every section without hitting company tables', async () => {
      const result = await service.getMyPermissions(1, null);

      expect(result.isSuperAdmin).toBe(true);
      expect(result.sections).toEqual(ALL_SECTIONS.map((s) => s.key));
      expect(prisma.companySection.findMany).not.toHaveBeenCalled();
      expect(prisma.userPermission.findMany).not.toHaveBeenCalled();
    });

    it('scopes a regular user to their company sections plus their own permission rows', async () => {
      prisma.companySection.findMany.mockResolvedValue([{ section: 'CACAO' }]);
      prisma.userPermission.findMany.mockResolvedValue([
        { section: 'CACAO', canView: true, canWrite: false },
      ]);

      const result = await service.getMyPermissions(5, 1);

      expect(result.isSuperAdmin).toBe(false);
      expect(result.sections).toContain('CACAO');
      expect(result.sections).not.toContain('VENTAS');
      expect(result.permissions).toEqual([
        { section: 'CACAO', canView: true, canWrite: false },
      ]);
    });
  });
  describe('getUsersWithExplicitSectionWrite', () => {
    const usuario = (id: number, companyId: number | null, permissions: { canWrite: boolean }[] = []) => ({
      id,
      companyId,
      fullName: `U${id}`,
      email: `u${id}@x.com`,
      company: companyId ? { name: `Empresa ${companyId}` } : null,
      permissions,
    });

    it('solo incluye a quien tiene fila con Escribir marcado: sin fila, solo lectura, el reportante y el super admin quedan fuera', async () => {
      prisma.user.findMany.mockResolvedValue([
        usuario(1, 1), // sin fila -> NO (nadie lo marcó)
        usuario(2, 1, [{ canWrite: true }]), // escritura explícita -> sí
        usuario(3, 1, [{ canWrite: false }]), // solo lectura -> no
        usuario(4, 2, [{ canWrite: true }]), // otra empresa -> sí (Sistemas atiende a todas)
        usuario(5, 1, [{ canWrite: true }]), // el reportante -> excluido
        usuario(6, null, [{ canWrite: true }]), // super admin (sin empresa) -> excluido
      ]);
      prisma.companySection.findMany.mockResolvedValue([]);

      const res = await service.getUsersWithExplicitSectionWrite('SISTEMAS', 5);

      expect(res.map((u) => u.id)).toEqual([2, 4]);
      expect(res.find((u) => u.id === 4)?.companyId).toBe(2);
    });

    it('una sección que no es alwaysEnabled exige que la empresa la tenga activa', async () => {
      prisma.user.findMany.mockResolvedValue([
        usuario(1, 1, [{ canWrite: true }]),
        usuario(2, 2, [{ canWrite: true }]),
      ]);
      prisma.companySection.findMany.mockResolvedValue([{ companyId: 2 }]);

      const res = await service.getUsersWithExplicitSectionWrite('CACAO');

      expect(res.map((u) => u.id)).toEqual([2]);
    });

    it('una sección desconocida no avisa a nadie', async () => {
      await expect(service.getUsersWithExplicitSectionWrite('TOOLS')).resolves.toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  it('Herramientas ya no es una sección de permisos propia', () => {
    expect(ALL_SECTIONS.map((s) => s.key)).not.toContain('TOOLS');
  });
});
