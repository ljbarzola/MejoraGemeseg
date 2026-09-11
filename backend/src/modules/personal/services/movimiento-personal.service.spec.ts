import { MovimientoPersonalService } from './movimiento-personal.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('MovimientoPersonalService.getCedulasFuera', () => {
  let service: MovimientoPersonalService;
  let prisma: { movimientoPersonal: { findMany: jest.Mock } };

  const mov = (over: any) => ({
    cedula: '000',
    tipo: 'ENTRADA',
    estado: 'COMPLETADO',
    ...over,
  });

  beforeEach(() => {
    prisma = { movimientoPersonal: { findMany: jest.fn() } };
    service = new MovimientoPersonalService(prisma as unknown as PrismaService);
  });

  it('considera "fuera" a una cédula cuyo movimiento más reciente es una SALIDA completada', async () => {
    prisma.movimientoPersonal.findMany.mockResolvedValue([
      mov({ cedula: 'A', tipo: 'SALIDA', estado: 'COMPLETADO' }),
    ]);
    const result = await service.getCedulasFuera(1);
    expect(result).toEqual(['A']);
  });

  it('NO considera "fuera" mientras la salida está EN_PROCESO', async () => {
    prisma.movimientoPersonal.findMany.mockResolvedValue([
      mov({ cedula: 'A', tipo: 'SALIDA', estado: 'EN_PROCESO' }),
    ]);
    const result = await service.getCedulasFuera(1);
    expect(result).toEqual([]);
  });

  it('NO considera "fuera" si lo último fue una ENTRADA (reingresó tras una salida vieja)', async () => {
    // findMany viene ordenado por createdAt desc — la ENTRADA nueva aparece primero.
    prisma.movimientoPersonal.findMany.mockResolvedValue([
      mov({ cedula: 'A', tipo: 'ENTRADA', estado: 'COMPLETADO' }),
      mov({ cedula: 'A', tipo: 'SALIDA', estado: 'COMPLETADO' }),
    ]);
    const result = await service.getCedulasFuera(1);
    expect(result).toEqual([]);
  });

  it('solo mira el movimiento más reciente por cédula, ignora el resto del historial', async () => {
    prisma.movimientoPersonal.findMany.mockResolvedValue([
      mov({ cedula: 'A', tipo: 'ENTRADA', estado: 'COMPLETADO' }), // más reciente: sigue activo
      mov({ cedula: 'A', tipo: 'SALIDA', estado: 'COMPLETADO' }), // viejo: ya no cuenta
      mov({ cedula: 'B', tipo: 'SALIDA', estado: 'COMPLETADO' }), // más reciente: fuera
    ]);
    const result = await service.getCedulasFuera(1);
    expect(result).toEqual(['B']);
  });

  it('devuelve vacío si no hay movimientos', async () => {
    prisma.movimientoPersonal.findMany.mockResolvedValue([]);
    const result = await service.getCedulasFuera(1);
    expect(result).toEqual([]);
  });
});

describe('MovimientoPersonalService.crearSalida', () => {
  let service: MovimientoPersonalService;
  let prisma: {
    movimientoPersonal: { findFirst: jest.Mock; create: jest.Mock };
    sistemaVerificacion: { findMany: jest.Mock };
    asignacionGuardia: { updateMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      movimientoPersonal: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 1, ...data, items: [] }),
          ),
      },
      sistemaVerificacion: { findMany: jest.fn().mockResolvedValue([]) },
      asignacionGuardia: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new MovimientoPersonalService(prisma as unknown as PrismaService);
  });

  it('nace COMPLETADO de una vez si no hay sistemas de verificación configurados, en vez de quedar EN_PROCESO sin ítems que marcar', async () => {
    const result = await service.crearSalida({
      cedula: 'A',
      nombreGuardia: 'Guardia A',
      companyId: 1,
      userId: 1,
      origen: 'MANUAL_GUARDIAS_LIST',
    });

    expect(result.estado).toBe('COMPLETADO');
    expect(result.completadoAt).not.toBeNull();
  });

  it('cierra la AsignacionGuardia activa de esa cédula cuando nace COMPLETADO (sin sistemas configurados)', async () => {
    await service.crearSalida({
      cedula: 'A',
      nombreGuardia: 'Guardia A',
      companyId: 1,
      userId: 1,
      origen: 'MANUAL_GUARDIAS_LIST',
    });

    expect(prisma.asignacionGuardia.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, cedula: 'A', fechaFin: null },
      data: { fechaFin: expect.any(Date) },
    });
  });

  it('nace EN_PROCESO (y no toca AsignacionGuardia todavía) cuando sí hay sistemas configurados', async () => {
    prisma.sistemaVerificacion.findMany.mockResolvedValue([
      { id: 1, nombre: 'IESS' },
    ]);

    const result = await service.crearSalida({
      cedula: 'A',
      nombreGuardia: 'Guardia A',
      companyId: 1,
      userId: 1,
      origen: 'MANUAL_GUARDIAS_LIST',
    });

    expect(result.estado).toBe('EN_PROCESO');
    expect(prisma.asignacionGuardia.updateMany).not.toHaveBeenCalled();
  });
});

describe('MovimientoPersonalService.toggleItem', () => {
  let service: MovimientoPersonalService;
  let prisma: {
    movimientoPersonal: { findFirst: jest.Mock; update: jest.Mock };
    movimientoPersonalItem: { update: jest.Mock; findMany: jest.Mock };
    asignacionGuardia: { updateMany: jest.Mock };
  };

  const salidaConUnItem = {
    id: 1,
    cedula: 'A',
    tipo: 'SALIDA',
    estado: 'EN_PROCESO',
    items: [{ id: 10, completado: false, notas: null }],
  };

  beforeEach(() => {
    prisma = {
      movimientoPersonal: {
        findFirst: jest.fn().mockResolvedValue(salidaConUnItem),
        update: jest.fn().mockResolvedValue({}),
      },
      movimientoPersonalItem: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
      asignacionGuardia: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new MovimientoPersonalService(prisma as unknown as PrismaService);
    // findOne() al final de toggleItem — no es el foco de este test, alcanza con no tirar error.
    (service as any).findOne = jest.fn().mockResolvedValue({});
  });

  it('cierra la AsignacionGuardia activa cuando el último ítem pendiente se completa (SALIDA pasa a COMPLETADO)', async () => {
    prisma.movimientoPersonalItem.findMany.mockResolvedValue([
      { id: 10, completado: true },
    ]);

    await service.toggleItem(1, 10, { completado: true }, 1, 99);

    expect(prisma.movimientoPersonal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'COMPLETADO' }),
      }),
    );
    expect(prisma.asignacionGuardia.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, cedula: 'A', fechaFin: null },
      data: { fechaFin: expect.any(Date) },
    });
  });

  it('NO toca AsignacionGuardia si todavía queda algún ítem pendiente', async () => {
    prisma.movimientoPersonal.findFirst.mockResolvedValue({
      ...salidaConUnItem,
      items: [
        { id: 10, completado: false, notas: null },
        { id: 11, completado: true, notas: null },
      ],
    });
    prisma.movimientoPersonalItem.findMany.mockResolvedValue([
      { id: 10, completado: false },
      { id: 11, completado: true },
    ]);

    await service.toggleItem(1, 11, { completado: true }, 1, 99);

    expect(prisma.asignacionGuardia.updateMany).not.toHaveBeenCalled();
  });

  it('NO toca AsignacionGuardia al completar una ENTRADA (solo aplica a SALIDA)', async () => {
    prisma.movimientoPersonal.findFirst.mockResolvedValue({
      ...salidaConUnItem,
      tipo: 'ENTRADA',
    });
    prisma.movimientoPersonalItem.findMany.mockResolvedValue([
      { id: 10, completado: true },
    ]);

    await service.toggleItem(1, 10, { completado: true }, 1, 99);

    expect(prisma.asignacionGuardia.updateMany).not.toHaveBeenCalled();
  });
});
