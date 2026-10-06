import { SistemasService } from './sistemas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';

function build(prisma: object) {
  return new SistemasService(
    prisma as unknown as PrismaService,
    {} as unknown as NotificationsService,
    {} as unknown as PermissionsService,
  );
}

describe('SistemasService.onModuleInit — tabla NovedadApp', () => {
  it('ejecuta cada sentencia del DDL idempotente, una por llamada', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(0) };

    await build(prisma).onModuleInit();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS "NovedadApp"',
    );
  });

  it('si la base rechaza el DDL, el servicio arranca igual (no lanza)', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('sin permiso')),
    };

    await expect(build(prisma).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('SistemasService.getStats — KPIs', () => {
  const hora = 3_600_000;
  const base = new Date('2026-10-01T00:00:00Z').getTime();

  function prismaConTickets(resueltos: { horas: number }[]) {
    return {
      ticketSoporte: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([
          { tipo: 'ERROR', _count: { _all: 3 } },
          { tipo: 'MEJORA', _count: { _all: 1 } },
        ]),
        findMany: jest.fn().mockResolvedValue(
          resueltos.map((r) => ({
            createdAt: new Date(base),
            resueltoAt: new Date(base + r.horas * hora),
          })),
        ),
      },
    };
  }

  it('cuenta por tipo con 0 en los tipos sin tickets', async () => {
    const stats = await build(prismaConTickets([])).getStats(1);

    expect(stats.porTipo).toEqual({ ERROR: 3, MEJORA: 1, PERMISO: 0, OTRO: 0 });
  });

  it('promedia resueltoAt - createdAt de los tickets resueltos', async () => {
    const stats = await build(prismaConTickets([{ horas: 10 }, { horas: 20 }])).getStats(1);

    expect(stats.tiempoPromedioResolucionHoras).toBe(15);
    expect(stats.ticketsConResolucion).toBe(2);
  });

  it('sin tickets resueltos el promedio es null', async () => {
    const stats = await build(prismaConTickets([])).getStats(1);

    expect(stats.tiempoPromedioResolucionHoras).toBeNull();
    expect(stats.ticketsConResolucion).toBe(0);
  });
});

describe('SistemasService.createTicket — aviso al equipo de Sistemas', () => {
  const ticket = {
    id: 7,
    companyId: 1,
    createdById: 10,
    tipo: 'ERROR',
    titulo: 'No carga el reporte',
    createdBy: { id: 10, fullName: 'Ana Pérez', email: 'ana@x.com' },
  };

  function armar(equipo: { id: number; companyId: number }[]) {
    const prisma = {
      ticketSoporte: { create: jest.fn().mockResolvedValue(ticket) },
    };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    const permissions = {
      getUsersWithExplicitSectionWrite: jest.fn().mockResolvedValue(equipo),
    };
    const service = new SistemasService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      permissions as unknown as PermissionsService,
    );
    return { service, notifications, permissions };
  }

  const datos = { tipo: 'ERROR' as const, titulo: 'x', descripcion: 'y' };

  it('avisa por campana a cada persona con SISTEMAS marcado para escribir, sin incluir a quien reporta', async () => {
    const { service, notifications, permissions } = armar([
      { id: 2, companyId: 1 },
      { id: 3, companyId: 5 },
    ]);

    await service.createTicket(1, 10, datos);

    expect(permissions.getUsersWithExplicitSectionWrite).toHaveBeenCalledWith('SISTEMAS', 10);
    const paraEquipo = notifications.create.mock.calls
      .map((c) => c[0])
      .filter((n) => n.title === 'Nuevo reporte para Sistemas');
    expect(paraEquipo.map((n) => [n.userId, n.companyId])).toEqual([
      [2, 1],
      [3, 5],
    ]);
    expect(paraEquipo[0].link).toBe('/sistemas/soporte');
    expect(paraEquipo[0].message).toContain('Ana Pérez');
    expect(paraEquipo[0].message).toContain('No carga el reporte');
  });

  it('si no se puede avisar al equipo, el ticket igual se crea (no lanza)', async () => {
    const { service, permissions } = armar([]);
    permissions.getUsersWithExplicitSectionWrite.mockRejectedValue(new Error('bd caída'));

    await expect(service.createTicket(1, 10, datos)).resolves.toMatchObject({ id: 7 });
  });

  it('si falla el aviso a una persona, los demás lo reciben igual', async () => {
    const { service, notifications } = armar([
      { id: 2, companyId: 1 },
      { id: 3, companyId: 1 },
    ]);
    notifications.create.mockImplementation((n: { userId: number }) =>
      n.userId === 2 ? Promise.reject(new Error('x')) : Promise.resolve({}),
    );

    await service.createTicket(1, 10, datos);

    expect(
      notifications.create.mock.calls.some((c) => c[0].userId === 3 && c[0].title === 'Nuevo reporte para Sistemas'),
    ).toBe(true);
  });
});
