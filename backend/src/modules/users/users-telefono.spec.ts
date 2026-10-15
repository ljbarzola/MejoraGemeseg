import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { limpiarTelefono, TELEFONO_USUARIO_REGEX } from './phone.const';

const errores = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body))).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('teléfono de una persona', () => {
  describe('formato', () => {
    it.each([
      '+593 99 897 4909',
      '0998974909',
      '(02) 234-5678',
      '+1 305 555 0100',
    ])('acepta %s', (tel) => {
      expect(TELEFONO_USUARIO_REGEX.test(tel)).toBe(true);
    });

    it.each(['abc', '12345', '099-ABC-4909', '0'.repeat(16), '+++', 'llamar'])(
      'rechaza %s',
      (tel) => {
        expect(TELEFONO_USUARIO_REGEX.test(tel)).toBe(false);
      },
    );

    it('vacío o solo espacios = sin teléfono', () => {
      expect(limpiarTelefono('   ')).toBeNull();
      expect(limpiarTelefono('')).toBeNull();
      expect(limpiarTelefono(null)).toBeNull();
      expect(limpiarTelefono(undefined)).toBeNull();
      expect(limpiarTelefono('  0998974909 ')).toBe('0998974909');
    });

    it('el DTO del perfil propio y el de administración usan la misma regla', async () => {
      expect(await errores(UpdateMeDto, { phone: '0998974909' })).toEqual([]);
      expect(await errores(UpdateMeDto, { phone: 'hola' })).toHaveLength(1);
      expect(await errores(UpdateUserDto, { phone: 'hola' })).toHaveLength(1);
      expect(await errores(UpdateUserDto, { phone: '0998974909' })).toEqual([]);
      // null (borrar) y ausente (no tocar) son válidos
      expect(await errores(UpdateMeDto, { phone: null })).toEqual([]);
      expect(await errores(UpdateMeDto, {})).toEqual([]);
    });
  });

  describe('UsersService', () => {
    let prisma: {
      user: {
        update: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
      };
    };
    let service: UsersService;

    beforeEach(() => {
      prisma = {
        user: {
          update: jest.fn().mockResolvedValue({ phone: '0998974909' }),
          findUnique: jest.fn().mockResolvedValue({ phone: '0991112222' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      service = new UsersService(prisma as unknown as PrismaService);
    });

    it('updateMe guarda SOLO el teléfono de quien lo pide', async () => {
      const r = await service.updateMe(7, { phone: ' 0998974909 ' });
      expect(r).toEqual({ phone: '0998974909' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { phone: '0998974909' },
        select: { phone: true },
      });
    });

    it('updateMe con vacío borra el teléfono', async () => {
      prisma.user.update.mockResolvedValue({ phone: null });
      await service.updateMe(7, { phone: '  ' });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ phone: null });
    });

    it('updateMe sin el campo no escribe nada', async () => {
      expect(await service.updateMe(7, {})).toEqual({ phone: '0991112222' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('el administrador puede poner o borrar el teléfono al editar a alguien', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 3, locationId: null });
      prisma.user.update.mockResolvedValue({ id: 3 });
      await service.update(3, { phone: '+593 99 897 4909' });
      expect(prisma.user.update.mock.calls[0][0].data.phone).toBe(
        '+593 99 897 4909',
      );
      await service.update(3, { phone: null });
      expect(prisma.user.update.mock.calls[1][0].data.phone).toBeNull();
    });

    it('un empleado NO recibe teléfonos en el listado de personas', async () => {
      await service.findAll(1, {}, 'EMPLOYEE');
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.select.phone).toBeUndefined();
    });
  });
});
