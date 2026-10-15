import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CLAVE_CAMBIO_CONTRASENA } from '../auth/password-rotation.service';

describe('UsersService — lista de usuarios y contraseña', () => {
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock };
    userPreference: { findUnique: jest.Mock };
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      userPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('un empleado recibe solo los campos para elegir personas (sin cédula, rol de sistema, ubicación ni conteos)', async () => {
      await service.findAll(1, {}, 'EMPLOYEE');
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.include).toBeUndefined();
      expect(Object.keys(args.select).sort()).toEqual(
        ['department', 'email', 'fullName', 'id', 'isActive', 'position', 'role'].sort(),
      );
      expect(args.select.documentNumber).toBeUndefined();
      expect(args.where.companyId).toBe(1);
    });

    it.each(['ADMIN', 'MANAGER'])('%s recibe la ficha completa', async (rol) => {
      await service.findAll(1, {}, rol);
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.select).toBeUndefined();
      expect(args.include).toEqual(
        expect.objectContaining({ department: true, roleRelation: true, location: true }),
      );
    });

    it('sin empresa y sin ser super administrador: lista vacía, nunca todas las empresas', async () => {
      const res = await service.findAll(null, {}, 'EMPLOYEE');
      expect(res).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('super administrador (ADMIN sin empresa) sí ve todas las empresas', async () => {
      await service.findAll(null, {}, 'ADMIN');
      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(prisma.user.findMany.mock.calls[0][0].where.companyId).toBeUndefined();
    });
  });

  describe('getMe — cambio de contraseña obligatorio', () => {
    const base = {
      id: 3,
      fullName: 'Ana',
      email: 'ana@gemeseg.com',
      role: 'ADMIN',
      password: 'hash-que-no-debe-salir',
    };

    it('no devuelve el hash y marca debeCambiarContrasena cuando la bandera está pendiente', async () => {
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.userPreference.findUnique.mockResolvedValue({ value: ['pendiente'] });

      const me = await service.getMe(3);

      expect(me).not.toHaveProperty('password');
      expect(me.hasPassword).toBe(true);
      expect(me.debeCambiarContrasena).toBe(true);
      expect(prisma.userPreference.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_key: { userId: 3, key: CLAVE_CAMBIO_CONTRASENA } },
        }),
      );
    });

    it('bandera "hecha" o ausente: no obliga', async () => {
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.userPreference.findUnique.mockResolvedValue({ value: ['hecha'] });
      expect((await service.getMe(3)).debeCambiarContrasena).toBe(false);
      prisma.userPreference.findUnique.mockResolvedValue(null);
      expect((await service.getMe(3)).debeCambiarContrasena).toBe(false);
    });

    it('cuenta sin contraseña (solo Google): nunca se obliga', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...base, password: null });
      prisma.userPreference.findUnique.mockResolvedValue({ value: ['pendiente'] });
      expect((await service.getMe(3)).debeCambiarContrasena).toBe(false);
    });

    it('si no se puede leer la bandera, no se bloquea a nadie', async () => {
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.userPreference.findUnique.mockRejectedValue(new Error('tabla no existe'));
      expect((await service.getMe(3)).debeCambiarContrasena).toBe(false);
    });
  });
});
