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

      expect(prisma.companySection.deleteMany).toHaveBeenCalledWith({
        where: { companyId: 1 },
      });
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
});
