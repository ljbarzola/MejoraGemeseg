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
