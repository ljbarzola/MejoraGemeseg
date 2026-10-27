import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsController } from './permissions.controller';
import {
  PermissionsService,
  permiteSinFila,
  SECCIONES_CERRADAS_POR_DEFECTO,
} from './permissions.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('permisos: Sistemas cerrado por defecto', () => {
  it('SISTEMAS y BITACORA están cerradas por defecto y el resto sigue abierto sin fila', () => {
    expect(SECCIONES_CERRADAS_POR_DEFECTO).toEqual(['SISTEMAS', 'BITACORA']);
    expect(permiteSinFila('SISTEMAS')).toBe(false);
    expect(permiteSinFila('BITACORA')).toBe(false);
    expect(permiteSinFila('VENTAS')).toBe(true);
    expect(permiteSinFila('RRHH')).toBe(true);
  });

  describe('PermissionsService', () => {
    let prisma: {
      companySection: { findMany: jest.Mock };
      userPermission: { findMany: jest.Mock };
      user: { findUnique: jest.Mock; findMany: jest.Mock };
    };
    let service: PermissionsService;
    const actor = { userId: 9, role: 'EMPLOYEE', companyId: 1 };

    beforeEach(() => {
      prisma = {
        companySection: { findMany: jest.fn().mockResolvedValue([]) },
        userPermission: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findUnique: jest.fn(), findMany: jest.fn() },
      };
      service = new PermissionsService(prisma as unknown as PrismaService);
    });

    it('hasSectionAccess: sin fila en SISTEMAS → sin acceso; sin fila en VENTAS → acceso', async () => {
      prisma.companySection.findMany.mockResolvedValue([
        { section: 'VENTAS', fixedForAll: false },
      ]);
      expect(await service.hasSectionAccess(actor, 'SISTEMAS')).toBe(false);
      expect(await service.hasSectionAccess(actor, 'VENTAS')).toBe(true);
    });

    it('hasSectionAccess: con fila explícita en SISTEMAS manda la fila', async () => {
      prisma.userPermission.findMany.mockResolvedValue([
        { section: 'SISTEMAS', canView: true, canWrite: false },
      ]);
      expect(await service.hasSectionAccess(actor, 'SISTEMAS', 'view')).toBe(true);
      expect(await service.hasSectionAccess(actor, 'SISTEMAS', 'write')).toBe(false);
    });

    it('getMyPermissions entrega una fila denegada para SISTEMAS cuando no hay fila', async () => {
      prisma.companySection.findMany.mockResolvedValue([
        { section: 'SISTEMAS', fixedForAll: false },
      ]);
      const res = await service.getMyPermissions(9, 1);
      expect(res.permissions).toContainEqual({
        section: 'SISTEMAS',
        canView: false,
        canWrite: false,
      });
    });

    it('getMyPermissions respeta la fila real de SISTEMAS si existe', async () => {
      prisma.userPermission.findMany.mockResolvedValue([
        { section: 'SISTEMAS', canView: true, canWrite: true },
      ]);
      const res = await service.getMyPermissions(9, 1);
      const filas = res.permissions.filter((p) => p.section === 'SISTEMAS');
      expect(filas).toEqual([{ section: 'SISTEMAS', canView: true, canWrite: true }]);
    });

    describe('assertPuedeGestionarUsuario', () => {
      it('usuario inexistente → 404', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(
          service.assertPuedeGestionarUsuario(5, { role: 'ADMIN', companyId: 1 }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('misma empresa → pasa', async () => {
        prisma.user.findUnique.mockResolvedValue({ companyId: 1 });
        await expect(
          service.assertPuedeGestionarUsuario(5, { role: 'ADMIN', companyId: 1 }),
        ).resolves.toBeUndefined();
      });

      it('otra empresa → 403', async () => {
        prisma.user.findUnique.mockResolvedValue({ companyId: 2 });
        await expect(
          service.assertPuedeGestionarUsuario(5, { role: 'ADMIN', companyId: 1 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('el usuario objetivo sin empresa tampoco lo puede tocar un admin de empresa', async () => {
        prisma.user.findUnique.mockResolvedValue({ companyId: null });
        await expect(
          service.assertPuedeGestionarUsuario(5, { role: 'ADMIN', companyId: 1 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('super administrador (ADMIN sin empresa) → pasa con cualquiera', async () => {
        prisma.user.findUnique.mockResolvedValue({ companyId: 2 });
        await expect(
          service.assertPuedeGestionarUsuario(5, { role: 'ADMIN', companyId: null }),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('PermissionsController', () => {
    it('setUserPermissions valida la empresa ANTES de escribir', async () => {
      const service = {
        assertPuedeGestionarUsuario: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('No tienes acceso a este usuario')),
        setUserPermissions: jest.fn(),
      };
      const controller = new PermissionsController(service as unknown as PermissionsService);
      await expect(
        controller.setUserPermissions(5, { permissions: [] } as any, {
          user: { role: 'ADMIN', companyId: 1 },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.setUserPermissions).not.toHaveBeenCalled();
    });

    it('setCompanySections sin ser super admin → 403, no un Error genérico (500)', () => {
      const service = { isSuperAdmin: jest.fn().mockReturnValue(false) };
      const controller = new PermissionsController(service as unknown as PermissionsService);
      expect(() =>
        controller.setCompanySections(1, { sections: [] } as any, {
          user: { role: 'ADMIN', companyId: 1 },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('SectionPermissionGuard', () => {
    function contexto(user: unknown) {
      return {
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      } as unknown as ExecutionContext;
    }

    function guardia(filas: { section: string; canView: boolean; canWrite: boolean }[]) {
      const permissions = {
        isSuperAdmin: () => false,
        getCompanySections: jest
          .fn()
          .mockResolvedValue([
            { key: 'SISTEMAS', enabled: true },
            { key: 'VENTAS', enabled: true },
          ]),
        getFixedSections: jest.fn().mockResolvedValue([]),
        getUserPermissions: jest.fn().mockResolvedValue(filas),
      };
      const reflector = {
        getAllAndOverride: jest.fn(),
      } as unknown as Reflector;
      return { guard: new SectionPermissionGuard(reflector, permissions as unknown as PermissionsService), reflector };
    }

    const user = { userId: 9, email: 'a@b.c', role: 'EMPLOYEE', companyId: 1 };

    it('sin fila en SISTEMAS: 403', async () => {
      const { guard, reflector } = guardia([]);
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
        section: 'SISTEMAS',
        access: 'view',
      });
      await expect(guard.canActivate(contexto(user))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('sin fila en VENTAS: pasa (default permisivo)', async () => {
      const { guard, reflector } = guardia([]);
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
        section: 'VENTAS',
        access: 'view',
      });
      await expect(guard.canActivate(contexto(user))).resolves.toBe(true);
    });

    it('con fila canView en SISTEMAS: pasa para ver y no para escribir', async () => {
      const { guard, reflector } = guardia([
        { section: 'SISTEMAS', canView: true, canWrite: false },
      ]);
      (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce({
        section: 'SISTEMAS',
        access: 'view',
      });
      await expect(guard.canActivate(contexto(user))).resolves.toBe(true);
      (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce({
        section: 'SISTEMAS',
        access: 'write',
      });
      await expect(guard.canActivate(contexto(user))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
