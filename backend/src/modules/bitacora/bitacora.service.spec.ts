import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BitacoraService,
  PeticionAutenticada,
  UsuarioBitacora,
} from './bitacora.service';

type Mock = jest.Mock;

interface PrismaMock {
  companySection: { findFirst: Mock };
  bitacoraActivacion: {
    findUnique: Mock;
    findMany: Mock;
    upsert: Mock;
    count: Mock;
  };
  bitacoraEvento: { create: Mock; findMany: Mock; aggregate: Mock };
  bitacoraConsulta: { create: Mock };
  user: { findMany: Mock; findFirst: Mock };
}

const admin: UsuarioBitacora = { userId: 1, companyId: 1, role: 'ADMIN' };
const gerente: UsuarioBitacora = { userId: 3, companyId: 1, role: 'MANAGER' };
const empleado: UsuarioBitacora = { userId: 2, companyId: 1, role: 'EMPLEADO' };

const peticion = (
  parcial: Partial<PeticionAutenticada> = {},
): PeticionAutenticada => ({
  method: 'PATCH',
  route: { path: '/api/tasks/:id' },
  params: { id: '3' },
  user: { userId: 2, companyId: 1, role: 'EMPLOYEE' },
  ...parcial,
});

describe('BitacoraService', () => {
  let prisma: PrismaMock;
  let notificaciones: { create: Mock };
  let service: BitacoraService;

  beforeEach(() => {
    prisma = {
      companySection: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      bitacoraActivacion: {
        findUnique: jest.fn().mockResolvedValue({ activa: true }),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      bitacoraEvento: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { ocurridoEn: null } }),
      },
      bitacoraConsulta: { create: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    };
    notificaciones = { create: jest.fn().mockResolvedValue({}) };
    service = new BitacoraService(
      prisma as unknown as PrismaService,
      notificaciones as unknown as NotificationsService,
    );
  });

  describe('registrarAccion: solo se anota a quien tiene la hoja activada', () => {
    it('anota la acción con módulo, ruta, id y nombre del registro (nunca el contenido)', async () => {
      await service.registrarAccion(peticion(), {
        id: 3,
        title: 'Informe de custodias',
        description: 'texto largo que no debe guardarse',
      });
      expect(prisma.bitacoraEvento.create).toHaveBeenCalledWith({
        data: {
          userId: 2,
          companyId: 1,
          fuente: 'APP',
          modulo: 'tasks',
          accion: 'EDITAR',
          ruta: '/tasks/:id',
          entidadId: 3,
          nombre: 'Informe de custodias',
        },
      });
    });

    it('al crear toma el id de la respuesta y no el de la ruta (que es el del padre)', async () => {
      await service.registrarAccion(
        peticion({
          method: 'POST',
          route: { path: '/api/projects/:projectId/tasks' },
          params: { projectId: '1' },
        }),
        { id: 9, title: 'Nueva' },
      );
      const data = prisma.bitacoraEvento.create.mock.calls[0][0].data;
      expect(data.accion).toBe('CREAR');
      expect(data.entidadId).toBe(9);
    });

    it('por defecto nadie: sin fila de activación no anota nada', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue(null);
      await service.registrarAccion(peticion(), { id: 3 });
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it('con la hoja desactivada no anota nada', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({ activa: false });
      await service.registrarAccion(peticion(), { id: 3 });
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it('si la empresa no tiene la sección encendida no anota nada, aunque la persona esté activada', async () => {
      prisma.companySection.findFirst.mockResolvedValue(null);
      await service.registrarAccion(peticion(), { id: 3 });
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
      expect(prisma.bitacoraActivacion.findUnique).not.toHaveBeenCalled();
    });

    it('leer pantallas (GET) no es una acción', async () => {
      await service.registrarAccion(peticion({ method: 'GET' }), { id: 3 });
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it.each([
      '/api/notifications/read-all',
      '/api/bitacora/activaciones/:userId',
      '/api/users/me/preferences/:clave',
    ])('no anota la ruta excluida %s', async (path) => {
      await service.registrarAccion(peticion({ route: { path } }), {});
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it('un super administrador (sin empresa) no se anota', async () => {
      await service.registrarAccion(
        peticion({ user: { userId: 9, companyId: null } }),
        {},
      );
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it('un guardado repetido en menos de 30 segundos se anota una sola vez', async () => {
      await service.registrarAccion(peticion(), { id: 3 });
      await service.registrarAccion(peticion(), { id: 3 });
      expect(prisma.bitacoraEvento.create).toHaveBeenCalledTimes(1);
    });

    it('si falla la base de datos, la petición del usuario no se rompe', async () => {
      prisma.bitacoraEvento.create.mockRejectedValue(new Error('db caída'));
      await expect(
        service.registrarAccion(peticion(), { id: 3 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('registrarAccion: inicio de sesión en app.gemeseg', () => {
    const login = peticion({
      method: 'POST',
      route: { path: '/api/auth/login' },
      params: {},
      user: undefined,
    });

    it('anota la sesión de quien tiene la hoja activada', async () => {
      await service.registrarAccion(login, {
        user: { id: 2, companyId: 1 },
        token: 't',
      });
      expect(prisma.bitacoraEvento.create).toHaveBeenCalledWith({
        data: {
          userId: 2,
          companyId: 1,
          fuente: 'APP',
          modulo: 'auth',
          accion: 'SESION',
          ruta: '/auth/login',
        },
      });
    });

    it('no anota la sesión de quien no está activado', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue(null);
      await service.registrarAccion(login, { user: { id: 2, companyId: 1 } });
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });

    it('ignora una respuesta sin usuario', async () => {
      await service.registrarAccion(login, {});
      expect(prisma.bitacoraEvento.create).not.toHaveBeenCalled();
    });
  });

  describe('caché de quién está activo', () => {
    it('no consulta la empresa en cada petición', async () => {
      await service.personaActiva(2, 1);
      await service.personaActiva(2, 1);
      expect(prisma.companySection.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.bitacoraActivacion.findUnique).toHaveBeenCalledTimes(1);
    });

    it('desactivar a alguien se nota al instante en este servidor, sin esperar a que caduque la caché', async () => {
      let activa = true;
      prisma.bitacoraActivacion.findUnique.mockImplementation(() =>
        Promise.resolve({ activa }),
      );
      prisma.bitacoraActivacion.upsert.mockImplementation(
        (args: { create: { activa: boolean } }) => {
          activa = args.create.activa;
          return Promise.resolve({});
        },
      );
      prisma.user.findFirst.mockResolvedValue({ id: 2 });
      prisma.user.findMany.mockResolvedValue([
        {
          id: 2,
          fullName: 'Ana',
          position: null,
          email: 'a@x.com',
          bitacoraActivacion: null,
        },
      ]);
      expect(await service.personaActiva(2, 1)).toBe(true);

      await service.cambiarActivacion(admin, 2, false);

      // Con la caché vieja seguiría en true; el cambio la invalida.
      expect(await service.personaActiva(2, 1)).toBe(false);
    });
  });

  describe('estado', () => {
    it('empresa apagada: nada visible y nadie administra', async () => {
      prisma.companySection.findFirst.mockResolvedValue(null);
      expect(await service.estado(admin)).toEqual({
        empresaActiva: false,
        registrada: false,
        activa: false,
        desde: null,
        puedeAdministrar: false,
      });
    });

    it('un administrador y un gerente pueden activar hojas; un empleado no', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue(null);
      expect((await service.estado(admin)).puedeAdministrar).toBe(true);
      expect((await service.estado(gerente)).puedeAdministrar).toBe(true);
      expect((await service.estado(empleado)).puedeAdministrar).toBe(false);
    });

    it('quien nunca fue activado no está «registrado» (no ve Mi hoja del día)', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue(null);
      const e = await service.estado(empleado);
      expect(e.registrada).toBe(false);
      expect(e.activa).toBe(false);
    });

    it('quien fue activado y luego desactivado sigue «registrado» para ver su historial', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({
        activa: false,
        desde: new Date('2026-10-27T17:00:00Z'),
      });
      const e = await service.estado(empleado);
      expect(e.registrada).toBe(true);
      expect(e.activa).toBe(false);
      expect(e.desde).toBe('2026-10-27T17:00:00.000Z');
    });

    it('un super administrador (sin empresa) no administra ni se registra', async () => {
      const e = await service.estado({
        userId: 9,
        companyId: null,
        role: 'ADMIN',
      });
      expect(e.empresaActiva).toBe(false);
      expect(e.puedeAdministrar).toBe(false);
    });
  });

  describe('listarActivaciones', () => {
    it('por defecto nadie está activado', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          position: 'Analista',
          email: 'a@x.com',
          bitacoraActivacion: null,
        },
        {
          id: 2,
          fullName: 'Beto',
          position: null,
          email: 'b@x.com',
          bitacoraActivacion: null,
        },
      ]);
      const lista = await service.listarActivaciones(admin);
      expect(lista.map((p) => p.activa)).toEqual([false, false]);
      expect(
        lista.every((p) => p.desde === null && p.cambiadaPor === null),
      ).toBe(true);
    });

    it('muestra desde cuándo y quién hizo el último cambio', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 2,
          fullName: 'Beto',
          position: null,
          email: 'b@x.com',
          bitacoraActivacion: {
            activa: true,
            desde: new Date('2026-10-27T17:00:00Z'),
            actualizadaEn: new Date('2026-10-27T17:00:00Z'),
            activadaPor: { fullName: 'Administración' },
          },
        },
      ]);
      const [p] = await service.listarActivaciones(admin);
      expect(p).toMatchObject({
        activa: true,
        desde: '2026-10-27T17:00:00.000Z',
        cambiadaPor: 'Administración',
      });
    });

    it('un empleado no puede ver la lista', async () => {
      await expect(service.listarActivaciones(empleado)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('con la bitácora apagada para la empresa tampoco', async () => {
      prisma.companySection.findFirst.mockResolvedValue(null);
      await expect(service.listarActivaciones(admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('cambiarActivacion', () => {
    const personaEnLista = {
      id: 2,
      fullName: 'Beto',
      position: null,
      email: 'b@x.com',
      bitacoraActivacion: null,
    };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue({ id: 2 });
      prisma.user.findMany.mockResolvedValue([personaEnLista]);
      prisma.bitacoraActivacion.findUnique.mockResolvedValue(null);
    });

    it('un empleado no puede activar a nadie', async () => {
      await expect(
        service.cambiarActivacion(empleado, 2, true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bitacoraActivacion.upsert).not.toHaveBeenCalled();
    });

    it('no se puede activar a una persona de otra empresa', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.cambiarActivacion(admin, 99, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 99, companyId: 1, isActive: true },
        select: { id: true },
      });
    });

    it('un gerente activa: se guarda desde ahora, quién lo hizo, y se avisa a la persona', async () => {
      await service.cambiarActivacion(gerente, 2, true);
      const arg = prisma.bitacoraActivacion.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 2 });
      expect(arg.create.activa).toBe(true);
      expect(arg.create.activadaPorId).toBe(3);
      expect(arg.create.desde).toBeInstanceOf(Date);
      expect(notificaciones.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          companyId: 1,
          title: 'Se activó tu hoja del día',
          link: '/bitacora/mi-hoja',
        }),
      );
    });

    it('reactivar empieza una nueva fecha: nada anterior se registra', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({ activa: false });
      await service.cambiarActivacion(admin, 2, true);
      const update = prisma.bitacoraActivacion.upsert.mock.calls[0][0].update;
      expect(update.activa).toBe(true);
      expect(update.desde).toBeInstanceOf(Date);
    });

    it('desactivar conserva la fecha de inicio (no la pisa) y avisa a la persona', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({ activa: true });
      await service.cambiarActivacion(admin, 2, false);
      const update = prisma.bitacoraActivacion.upsert.mock.calls[0][0].update;
      expect(update.activa).toBe(false);
      expect('desde' in update).toBe(false);
      expect(notificaciones.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Se desactivó tu hoja del día' }),
      );
    });

    it('si no cambia nada, no escribe ni vuelve a avisar', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({ activa: true });
      await service.cambiarActivacion(admin, 2, true);
      expect(prisma.bitacoraActivacion.upsert).not.toHaveBeenCalled();
      expect(notificaciones.create).not.toHaveBeenCalled();
    });

    it('si falla el aviso, el cambio igual queda hecho', async () => {
      notificaciones.create.mockRejectedValue(new Error('sin bandeja'));
      await expect(
        service.cambiarActivacion(admin, 2, true),
      ).resolves.toMatchObject({
        userId: 2,
      });
      expect(prisma.bitacoraActivacion.upsert).toHaveBeenCalled();
    });
  });

  describe('resolverFecha', () => {
    it('sin fecha usa hoy en Ecuador', () => {
      expect(service.resolverFecha()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('acepta una fecha válida', () => {
      expect(service.resolverFecha('2026-10-27')).toBe('2026-10-27');
    });

    it('rechaza una fecha inválida con un mensaje en español', () => {
      expect(() => service.resolverFecha('2026-13-45')).toThrow(
        BadRequestException,
      );
      expect(() => service.resolverFecha('hoy')).toThrow(/AAAA-MM-DD/);
    });
  });

  describe('resumenEquipo', () => {
    it('lista a los activados y, solo si registraron algo ese día, a los que ya no lo están (historial)', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        { userId: 1, activa: true },
        { userId: 2, activa: false },
        { userId: 3, activa: false },
      ]);
      prisma.bitacoraEvento.findMany.mockResolvedValue([
        {
          userId: 2,
          fuente: 'APP',
          modulo: 'tasks',
          accion: 'EDITAR',
          ruta: '/tasks/:id',
          nombre: null,
          ocurridoEn: new Date('2026-10-27T14:00:00Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 1, fullName: 'Ana', position: null },
        { id: 2, fullName: 'Beto', position: 'Analista' },
      ]);

      const filas = await service.resumenEquipo(1, '2026-10-27');

      // La persona 3 (desactivada y sin actividad ese día) no se pide siquiera.
      expect(prisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual([
        1, 2,
      ]);
      expect(filas.map((f) => [f.nombre, f.activa, f.totalEventos])).toEqual([
        ['Ana', true, 0],
        ['Beto', false, 1],
      ]);
    });

    it('sin nadie activado ni actividad, la lista queda vacía y no consulta personas', async () => {
      const filas = await service.resumenEquipo(1, '2026-10-27');
      expect(filas).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('personaDeLaEmpresa', () => {
    it('no encuentra a alguien de otra empresa', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.personaDeLaEmpresa(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('indica si hoy se le registra', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 2,
        fullName: 'Beto',
        position: null,
        bitacoraActivacion: { activa: false },
      });
      expect(await service.personaDeLaEmpresa(1, 2)).toMatchObject({
        id: 2,
        activa: false,
      });
    });
  });

  describe('hojaDe y registrarConsulta', () => {
    it('pide solo los eventos del día de Ecuador', async () => {
      await service.hojaDe(2, '2026-10-27');
      const where = prisma.bitacoraEvento.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(2);
      expect(where.ocurridoEn.gte.toISOString()).toBe(
        '2026-10-27T05:00:00.000Z',
      );
      expect(where.ocurridoEn.lt.toISOString()).toBe(
        '2026-10-28T05:00:00.000Z',
      );
    });

    it('anota quién miró la hoja de quién, pero no cuando alguien mira la suya', async () => {
      await service.registrarConsulta(1, 2, '2026-10-27');
      await service.registrarConsulta(2, 2, '2026-10-27');
      expect(prisma.bitacoraConsulta.create).toHaveBeenCalledTimes(1);
      expect(prisma.bitacoraConsulta.create).toHaveBeenCalledWith({
        data: { consultorId: 1, personaId: 2, fecha: '2026-10-27' },
      });
    });

    it('si no se puede anotar la consulta, igual se muestra la hoja', async () => {
      prisma.bitacoraConsulta.create.mockRejectedValue(new Error('x'));
      await expect(
        service.registrarConsulta(1, 2, '2026-10-27'),
      ).resolves.toBeUndefined();
    });
  });

  describe('exigirAdministrador', () => {
    it('devuelve la empresa de un administrador o un gerente', async () => {
      expect(await service.exigirAdministrador(admin)).toBe(1);
      expect(await service.exigirAdministrador(gerente)).toBe(1);
    });

    it('un empleado y un super administrador no administran la bitácora', async () => {
      await expect(
        service.exigirAdministrador(empleado),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.exigirAdministrador({
          userId: 9,
          companyId: null,
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con la bitácora apagada para la empresa tampoco', async () => {
      prisma.companySection.findFirst.mockResolvedValue(null);
      await expect(service.exigirAdministrador(admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('resumenGoogle (pestaña Google de Configuración)', () => {
    it('cuenta las personas activadas de la empresa y da el último evento de Google guardado', async () => {
      prisma.bitacoraActivacion.count.mockResolvedValue(3);
      prisma.bitacoraEvento.aggregate.mockResolvedValue({
        _max: { ocurridoEn: new Date('2026-10-27T17:30:00Z') },
      });
      expect(await service.resumenGoogle(1)).toEqual({
        personasActivas: 3,
        ultimoEvento: '2026-10-27T17:30:00.000Z',
      });
      expect(prisma.bitacoraActivacion.count).toHaveBeenCalledWith({
        where: { activa: true, user: { companyId: 1, isActive: true } },
      });
      expect(prisma.bitacoraEvento.aggregate).toHaveBeenCalledWith({
        where: { companyId: 1, fuente: 'GOOGLE' },
        _max: { ocurridoEn: true },
      });
    });

    it('si todavía no se leyó nada de Google, no hay último evento', async () => {
      expect(await service.resumenGoogle(1)).toEqual({
        personasActivas: 0,
        ultimoEvento: null,
      });
    });
  });

  describe('metricas', () => {
    it('pide solo los eventos de la empresa en el período elegido (hasta hoy, hora de Ecuador)', async () => {
      prisma.bitacoraActivacion.count.mockResolvedValue(4);
      const m = await service.metricas(1, '14');
      expect(m.dias).toBe(14);
      expect(m.personasActivas).toBe(4);
      expect(m.porDia).toHaveLength(14);

      const where = prisma.bitacoraEvento.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(1);
      const ms = where.ocurridoEn.lt.getTime() - where.ocurridoEn.gte.getTime();
      expect(ms).toBe(14 * 24 * 3_600_000);
    });

    it('un período no permitido vuelve a 7 días', async () => {
      expect((await service.metricas(1, '99')).dias).toBe(7);
      expect((await service.metricas(1)).dias).toBe(7);
    });

    it('cuenta a las personas activadas de la empresa', async () => {
      await service.metricas(1, '7');
      expect(prisma.bitacoraActivacion.count).toHaveBeenCalledWith({
        where: { activa: true, user: { companyId: 1, isActive: true } },
      });
    });
  });
});
