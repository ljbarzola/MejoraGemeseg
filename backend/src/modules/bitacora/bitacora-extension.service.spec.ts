import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BitacoraExtensionService,
  ExtensionAutenticada,
} from './bitacora-extension.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';
import {
  generarToken,
  hashear,
  normalizarCodigo,
} from './bitacora-extension.util';

type Mock = jest.Mock;

interface PrismaMock {
  bitacoraHorario: { findUnique: Mock; upsert: Mock };
  bitacoraExtensionCodigo: {
    upsert: Mock;
    findUnique: Mock;
    deleteMany: Mock;
  };
  bitacoraExtensionVinculo: {
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
    updateMany: Mock;
  };
  bitacoraActivacion: { findUnique: Mock };
  bitacoraEvento: { createMany: Mock };
  user: { findUnique: Mock };
}

const admin: UsuarioBitacora = { userId: 1, companyId: 1, role: 'ADMIN' };
const persona: UsuarioBitacora = { userId: 2, companyId: 1, role: 'EMPLOYEE' };
const ext: ExtensionAutenticada = {
  vinculoId: 9,
  userId: 2,
  companyId: 1,
  nombre: 'Beto',
};

// Todos los días de 00:00 a 23:59.
const TODO_EL_DIA = {
  companyId: 1,
  dias: '1,2,3,4,5,6,7',
  inicio: '00:00',
  fin: '23:59',
};

describe('BitacoraExtensionService', () => {
  let prisma: PrismaMock;
  let bitacora: {
    exigirAdministrador: Mock;
    personaActiva: Mock;
  };
  let notificaciones: { create: Mock };
  let service: BitacoraExtensionService;

  beforeEach(() => {
    // Miércoles 28 de octubre de 2026, 11:00 en Ecuador: así ningún caso depende de la hora en que corra el test.
    jest.useFakeTimers({ now: new Date('2026-10-28T16:00:00Z') });
    prisma = {
      bitacoraHorario: {
        findUnique: jest.fn().mockResolvedValue(TODO_EL_DIA),
        upsert: jest.fn().mockResolvedValue({}),
      },
      bitacoraExtensionCodigo: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bitacoraExtensionVinculo: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bitacoraActivacion: {
        findUnique: jest.fn().mockResolvedValue({ desde: null }),
      },
      bitacoraEvento: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) =>
            Promise.resolve({ count: data.length }),
          ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          fullName: 'Beto',
          companyId: 1,
          isActive: true,
        }),
      },
    };
    bitacora = {
      exigirAdministrador: jest.fn().mockResolvedValue(1),
      personaActiva: jest.fn().mockResolvedValue(true),
    };
    notificaciones = { create: jest.fn().mockResolvedValue({}) };
    service = new BitacoraExtensionService(
      prisma as unknown as PrismaService,
      bitacora as unknown as BitacoraService,
      notificaciones as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('horario', () => {
    it('sin horario guardado propone lunes a viernes de 8 a 17 pero dice que no está configurado', async () => {
      prisma.bitacoraHorario.findUnique.mockResolvedValue(null);
      expect(await service.obtenerHorario(admin)).toEqual({
        configurado: false,
        dias: [1, 2, 3, 4, 5],
        inicio: '08:00',
        fin: '17:00',
      });
    });

    it('solo administradores y gerentes lo ven y lo guardan', async () => {
      bitacora.exigirAdministrador.mockRejectedValue(new ForbiddenException());
      await expect(service.obtenerHorario(persona)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.guardarHorario(persona, {
          dias: [1],
          inicio: '08:00',
          fin: '17:00',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bitacoraHorario.upsert).not.toHaveBeenCalled();
    });

    it('guarda los días ordenados y rechaza un fin anterior al inicio', async () => {
      await service.guardarHorario(admin, {
        dias: [5, 1, 3],
        inicio: '08:00',
        fin: '17:00',
      });
      expect(prisma.bitacoraHorario.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1 },
          create: expect.objectContaining({
            companyId: 1,
            dias: '1,3,5',
            inicio: '08:00',
            fin: '17:00',
            actualizadoPorId: 1,
          }),
        }),
      );
      await expect(
        service.guardarHorario(admin, {
          dias: [1],
          inicio: '17:00',
          fin: '08:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('crearCodigo', () => {
    it('da un código de un solo uso y guarda solo su hash', async () => {
      const r = await service.crearCodigo(persona);
      expect(r.codigo).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(new Date(r.expiraEn).getTime()).toBeGreaterThan(
        Date.now() + 9 * 60_000,
      );
      const guardado = prisma.bitacoraExtensionCodigo.upsert.mock
        .calls[0][0] as { create: { codigoHash: string } };
      expect(guardado.create.codigoHash).toBe(
        hashear(normalizarCodigo(r.codigo) as string),
      );
      expect(JSON.stringify(guardado)).not.toContain(r.codigo);
    });

    it('si a la persona no se le registra la hoja, no hay código', async () => {
      bitacora.personaActiva.mockResolvedValue(false);
      await expect(service.crearCodigo(persona)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.bitacoraExtensionCodigo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('vincular', () => {
    const filaCodigo = (expiraEn = new Date(Date.now() + 5 * 60_000)) => ({
      userId: 2,
      codigoHash: hashear('K7M29QXP'),
      expiraEn,
    });

    it('cambia el código por un token propio, avisa a la persona y guarda solo el hash', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      const r = await service.vincular(
        'k7m2-9qxp',
        'Edge en Windows',
        '1.1.1.1',
      );
      expect(r.token).toMatch(/^bx_/);
      expect(r.nombre).toBe('Beto');
      expect(prisma.bitacoraExtensionVinculo.create).toHaveBeenCalledWith({
        data: {
          userId: 2,
          tokenHash: hashear(r.token),
          nombreEquipo: 'Edge en Windows',
        },
      });
      expect(
        JSON.stringify(prisma.bitacoraExtensionVinculo.create.mock.calls),
      ).not.toContain(r.token);
      expect(notificaciones.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, link: '/bitacora/mi-hoja' }),
      );
    });

    it('el código sirve una sola vez, aunque dos peticiones lleguen a la vez', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      prisma.bitacoraExtensionCodigo.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bitacoraExtensionVinculo.create).not.toHaveBeenCalled();
    });

    it('rechaza un código que no existe, venció o está mal escrito', async () => {
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(
        filaCodigo(new Date(Date.now() - 1000)),
      );
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.vincular('corto', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bitacoraExtensionVinculo.create).not.toHaveBeenCalled();
    });

    it('si mientras tanto le apagaron la hoja, no se vincula', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      bitacora.personaActiva.mockResolvedValue(false);
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bitacoraExtensionVinculo.create).not.toHaveBeenCalled();
    });

    it('con una persona inactiva no se vincula', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        fullName: 'Beto',
        companyId: 1,
        isActive: false,
      });
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recorta el nombre del equipo y tolera que no venga', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      await service.vincular('K7M2-9QXP', 'x'.repeat(200), '1.1.1.1');
      expect(
        (
          prisma.bitacoraExtensionVinculo.create.mock.calls[0][0] as {
            data: { nombreEquipo: string };
          }
        ).data.nombreEquipo,
      ).toHaveLength(60);
      await service.vincular('K7M2-9QXP', undefined, '1.1.1.1');
      expect(
        (
          prisma.bitacoraExtensionVinculo.create.mock.calls[1][0] as {
            data: { nombreEquipo: string | null };
          }
        ).data.nombreEquipo,
      ).toBeNull();
    });

    it('deja como máximo 5 equipos vinculados: revoca los más viejos', async () => {
      prisma.bitacoraExtensionCodigo.findUnique.mockResolvedValue(filaCodigo());
      prisma.bitacoraExtensionVinculo.findMany.mockResolvedValue(
        [10, 9, 8, 7, 6, 5, 4].map((id) => ({ id })),
      );
      await service.vincular('K7M2-9QXP', 'Equipo', '1.1.1.1');
      expect(prisma.bitacoraExtensionVinculo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [5, 4] } },
        data: { revocadoEn: expect.any(Date) as Date },
      });
    });

    it('tras 10 códigos falsos desde la misma dirección responde «demasiados intentos»', async () => {
      for (let i = 0; i < 10; i++) {
        await expect(
          service.vincular('K7M2-9QXP', 'Equipo', '9.9.9.9'),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '9.9.9.9'),
      ).rejects.toMatchObject({ status: 429 });
      // Otra dirección sigue pudiendo intentar.
      await expect(
        service.vincular('K7M2-9QXP', 'Equipo', '8.8.8.8'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('autenticar', () => {
    it('identifica a la extensión por el hash de su token', async () => {
      const token = generarToken();
      prisma.bitacoraExtensionVinculo.findUnique.mockResolvedValue({
        id: 9,
        userId: 2,
        revocadoEn: null,
      });
      const r = await service.autenticar(token);
      expect(prisma.bitacoraExtensionVinculo.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashear(token) },
      });
      expect(r).toEqual(ext);
    });

    it('un token desconocido, revocado o de una persona inactiva no entra', async () => {
      const token = generarToken();
      expect(await service.autenticar(token)).toBeNull();
      prisma.bitacoraExtensionVinculo.findUnique.mockResolvedValue({
        id: 9,
        userId: 2,
        revocadoEn: new Date(),
      });
      expect(await service.autenticar(token)).toBeNull();
      prisma.bitacoraExtensionVinculo.findUnique.mockResolvedValue({
        id: 9,
        userId: 2,
        revocadoEn: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        fullName: 'Beto',
        companyId: 1,
        isActive: false,
      });
      expect(await service.autenticar(token)).toBeNull();
    });
  });

  describe('configuracion', () => {
    it('con hoja activa y horario guardado, dice que toca registrar y en qué horario', async () => {
      const r = await service.configuracion(ext);
      expect(r.registrando).toBe(true);
      expect(r.horario).toEqual({
        dias: [1, 2, 3, 4, 5, 6, 7],
        inicio: '00:00',
        fin: '23:59',
        zona: 'America/Guayaquil',
      });
      expect(r.nombre).toBe('Beto');
    });

    it('sin horario guardado no registra', async () => {
      prisma.bitacoraHorario.findUnique.mockResolvedValue(null);
      const r = await service.configuracion(ext);
      expect(r.registrando).toBe(false);
      expect(r.horario).toBeNull();
    });

    it('con la hoja apagada no registra ni entrega el horario', async () => {
      bitacora.personaActiva.mockResolvedValue(false);
      const r = await service.configuracion(ext);
      expect(r.registrando).toBe(false);
      expect(r.horario).toBeNull();
      expect(prisma.bitacoraHorario.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('recibirTramos', () => {
    const hace = (minutos: number) =>
      new Date(
        Math.floor(Date.now() / 60_000) * 60_000 - minutos * 60_000,
      ).toISOString();
    const tramo = (parcial: Record<string, unknown> = {}) => ({
      dominio: 'ejemplo.com',
      inicio: hace(30),
      minutos: 5,
      ...parcial,
    });

    it('guarda los sitios web como eventos de la extensión, con dominio y minutos', async () => {
      const t = tramo();
      const r = await service.recibirTramos(ext, [t]);
      expect(r).toEqual({ guardados: 1, descartados: 0, registrando: true });
      expect(prisma.bitacoraEvento.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 2,
            companyId: 1,
            fuente: 'EXTENSION',
            modulo: 'web',
            accion: 'SITIO',
            nombre: 'ejemplo.com',
            minutos: 5,
            externalId: `2|ejemplo.com|${t.inicio}`,
            ocurridoEn: new Date(t.inicio),
          },
        ],
        skipDuplicates: true,
      });
    });

    it('nunca guarda la dirección completa: la descarta', async () => {
      const r = await service.recibirTramos(ext, [
        tramo({ dominio: 'https://ejemplo.com/cuenta?id=1' }),
      ]);
      expect(r.guardados).toBe(0);
      expect(r.descartados).toBe(1);
      expect(prisma.bitacoraEvento.createMany).not.toHaveBeenCalled();
    });

    it('con la hoja apagada descarta todo y avisa que ya no se registra', async () => {
      bitacora.personaActiva.mockResolvedValue(false);
      const r = await service.recibirTramos(ext, [tramo(), tramo()]);
      expect(r).toEqual({ guardados: 0, descartados: 2, registrando: false });
      expect(prisma.bitacoraEvento.createMany).not.toHaveBeenCalled();
    });

    it('sin horario guardado descarta todo', async () => {
      prisma.bitacoraHorario.findUnique.mockResolvedValue(null);
      const r = await service.recibirTramos(ext, [tramo()]);
      expect(r).toEqual({ guardados: 0, descartados: 1, registrando: false });
    });

    it('fuera del horario descarta, aunque la extensión lo haya mandado', async () => {
      // El tramo es de las 10:30 en Ecuador; el horario de la empresa es de 13:00 a 14:00.
      prisma.bitacoraHorario.findUnique.mockResolvedValue({
        ...TODO_EL_DIA,
        inicio: '13:00',
        fin: '14:00',
      });
      const r = await service.recibirTramos(ext, [tramo()]);
      expect(r.guardados).toBe(0);
      expect(r.descartados).toBe(1);
    });

    it('descarta lo anterior a la activación de la hoja', async () => {
      prisma.bitacoraActivacion.findUnique.mockResolvedValue({
        desde: new Date(Date.now() - 10 * 60_000),
      });
      const r = await service.recibirTramos(ext, [tramo({ inicio: hace(30) })]);
      expect(r.guardados).toBe(0);
      expect(r.descartados).toBe(1);
    });

    it('si no se puede guardar responde un error corto, sin texto técnico, y no pierde nada', async () => {
      prisma.bitacoraEvento.createMany.mockRejectedValue(
        new Error('connection terminated: password authentication failed'),
      );
      await expect(service.recibirTramos(ext, [tramo()])).rejects.toMatchObject(
        {
          status: 503,
          message: 'No se pudo guardar. Se reintentará más tarde.',
        },
      );
    });
  });

  describe('estado y desvinculación', () => {
    it('lista los equipos vinculados de la persona', async () => {
      prisma.bitacoraExtensionVinculo.findMany.mockResolvedValue([
        {
          id: 9,
          nombreEquipo: 'Edge en Windows',
          creadoEn: new Date('2026-10-29T14:00:00Z'),
          ultimoUso: null,
        },
      ]);
      const r = await service.estadoPersona(persona);
      expect(r.vinculada).toBe(true);
      expect(r.dispositivos[0]).toEqual({
        id: 9,
        nombreEquipo: 'Edge en Windows',
        creadoEn: '2026-10-29T14:00:00.000Z',
        ultimoUso: null,
      });
      expect(prisma.bitacoraExtensionVinculo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 2, revocadoEn: null } }),
      );
    });

    it('la persona revoca todos sus equipos y su código pendiente', async () => {
      await service.revocarTodas(persona);
      expect(prisma.bitacoraExtensionVinculo.updateMany).toHaveBeenCalledWith({
        where: { userId: 2, revocadoEn: null },
        data: { revocadoEn: expect.any(Date) as Date },
      });
      expect(prisma.bitacoraExtensionCodigo.deleteMany).toHaveBeenCalledWith({
        where: { userId: 2 },
      });
    });

    it('la propia extensión se desvincula', async () => {
      await service.desvincular(ext);
      expect(prisma.bitacoraExtensionVinculo.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { revocadoEn: expect.any(Date) as Date },
      });
    });
  });
});
