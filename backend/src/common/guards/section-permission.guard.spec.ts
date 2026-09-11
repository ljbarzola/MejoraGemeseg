import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SectionPermissionGuard } from './section-permission.guard';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { SectionRequirement } from '../decorators/section.decorator';

describe('SectionPermissionGuard', () => {
  let guard: SectionPermissionGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let permissions: {
    isSuperAdmin: jest.Mock;
    getCompanySections: jest.Mock;
    getUserPermissions: jest.Mock;
  };

  const context = (user: any) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  const requireSection = (req: SectionRequirement | undefined) =>
    reflector.getAllAndOverride.mockReturnValue(req);

  const employee = { userId: 5, role: 'EMPLOYEE', companyId: 1 };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    permissions = {
      isSuperAdmin: jest.fn().mockReturnValue(false),
      getCompanySections: jest
        .fn()
        .mockResolvedValue([{ key: 'RRHH', enabled: true }]),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };
    guard = new SectionPermissionGuard(
      reflector as unknown as Reflector,
      permissions as unknown as PermissionsService,
    );
  });

  it('deja pasar los endpoints sin @Section', async () => {
    requireSection(undefined);
    await expect(guard.canActivate(context(employee))).resolves.toBe(true);
  });

  it('el super admin pasa siempre', async () => {
    requireSection({ section: 'RRHH', access: 'write' });
    permissions.isSuperAdmin.mockReturnValue(true);

    await expect(
      guard.canActivate(context({ userId: 1, role: 'ADMIN', companyId: null })),
    ).resolves.toBe(true);
    expect(permissions.getCompanySections).not.toHaveBeenCalled();
  });

  it('bloquea si la sección no está habilitada para la empresa', async () => {
    requireSection({ section: 'RRHH', access: 'view' });
    permissions.getCompanySections.mockResolvedValue([
      { key: 'RRHH', enabled: false },
    ]);

    await expect(guard.canActivate(context(employee))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  // Este es el comportamiento que replica usePermissions en el frontend: si el
  // usuario no tiene permisos explícitos cargados, se le permite. Si algún día
  // se invierte el default, este test debe avisar antes de dejar fuera a RRHH.
  it('permite cuando el usuario no tiene fila de permisos para la sección', async () => {
    requireSection({ section: 'RRHH', access: 'write' });
    permissions.getUserPermissions.mockResolvedValue([]);

    await expect(guard.canActivate(context(employee))).resolves.toBe(true);
  });

  it('respeta canWrite cuando hay permiso explícito', async () => {
    requireSection({ section: 'RRHH', access: 'write' });
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'RRHH', canView: true, canWrite: false },
    ]);

    await expect(guard.canActivate(context(employee))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite ver aunque no pueda escribir', async () => {
    requireSection({ section: 'RRHH', access: 'view' });
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'RRHH', canView: true, canWrite: false },
    ]);

    await expect(guard.canActivate(context(employee))).resolves.toBe(true);
  });

  it('bloquea a un usuario de empresa sin companyId', async () => {
    requireSection({ section: 'RRHH', access: 'write' });

    await expect(
      guard.canActivate(
        context({ userId: 9, role: 'EMPLOYEE', companyId: null }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
