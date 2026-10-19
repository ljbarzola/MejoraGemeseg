import { BadRequestException } from '@nestjs/common';
import { BitacorasService } from './bitacoras.service';
import { LecturaBitacoraError } from './bitacora-lector.service';
import type { PrismaService } from '../../../prisma/prisma.service';

jest.mock('../../../common/utils/stored-file.util', () => ({
  saveStoredFile: jest.fn().mockResolvedValue(undefined),
  readStoredFile: jest.fn(),
  deleteStoredFile: jest.fn(),
}));

const ACTOR = { userId: 7, companyId: 1, nombre: 'Leidy Barzola' };

const puesto = {
  id: 10,
  nombre: 'Garita norte',
  guardias: [
    { cedula: '1', nombreGuardia: 'Pérez Mora Juan Carlos' },
    { cedula: '2', nombreGuardia: 'Gómez Ruiz Pedro' },
  ],
  contrato: {
    id: 3,
    numero: 'CTR-1',
    fechaInicio: new Date('2026-01-01T00:00:00Z'),
    fechaFin: new Date('2026-12-31T00:00:00Z'),
    entidad: { id: 5, nombre: 'Municipio de Ejemplo' },
  },
};

function montar(opciones: {
  agente?: {
    id: number;
    name: string;
    isActive: boolean;
    instructions: string;
    scope: string;
  } | null;
  iaConfigurada?: boolean;
  leer?: jest.Mock;
}) {
  const bitacoraBase = {
    id: 99,
    companyId: 1,
    puestoId: 10,
    puestoNombre: 'Garita norte',
    entidadNombre: 'Municipio de Ejemplo',
    archivoKey: null,
    archivoTipo: null,
    origenLectura: 'IA',
    estadoLectura: 'SIN_LECTURA',
    observaciones: null,
  };
  const prisma = {
    cPPuestoServicio: { findFirst: jest.fn().mockResolvedValue(puesto) },
    cPBitacora: {
      create: jest.fn().mockResolvedValue(bitacoraBase),
      update: jest.fn().mockResolvedValue(bitacoraBase),
      findFirst: jest.fn().mockResolvedValue({
        ...bitacoraBase,
        registros: [],
        novedades: [],
        hallazgos: [],
        fechas: [],
        puestoLeido: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cPHorarioMensual: { findMany: jest.fn().mockResolvedValue([]) },
    cPHorarioCelda: { findMany: jest.fn().mockResolvedValue([]) },
    cPCodigoTurno: { findMany: jest.fn().mockResolvedValue([]) },
    cPBitacoraRegistro: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    cPBitacoraNovedad: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    cPBitacoraHallazgo: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const lector = {
    estaConfigurado: jest.fn().mockReturnValue(opciones.iaConfigurada ?? true),
    leer: opciones.leer ?? jest.fn(),
  };
  const agentRuns = {
    obtenerTrabajador: jest.fn().mockResolvedValue(
      opciones.agente === undefined
        ? {
            id: 4,
            name: 'Agente Revisor de Bitácoras',
            isActive: true,
            instructions: '',
            scope: 'BITACORAS',
          }
        : opciones.agente,
    ),
    registrar: jest.fn().mockResolvedValue(undefined),
  };
  const servicio = new BitacorasService(
    prisma as unknown as PrismaService,
    lector as any,
    agentRuns as any,
  );
  return { servicio, prisma, lector, agentRuns };
}

const foto = {
  buffer: Buffer.from('foto'),
  mimetype: 'image/jpeg',
  originalname: 'hoja.jpg',
};

const estadoGuardado = (prisma: ReturnType<typeof montar>['prisma']) => {
  // El último cPBitacora.update de la transacción lleva el estado de la lectura.
  const llamadas = prisma.cPBitacora.update.mock.calls.map((c) => c[0].data);
  return llamadas.find((d: any) => d.estadoLectura);
};

describe('BitacorasService.releer cuando falla la IA', () => {
  it('conserva lo que ya estaba escrito y solo avisa del fallo', async () => {
    const { servicio, prisma, lector } = montar({ iaConfigurada: false });
    prisma.cPBitacora.findFirst.mockResolvedValue({
      id: 99,
      companyId: 1,
      puestoId: 10,
      puestoNombre: 'Garita norte',
      entidadNombre: 'M',
      archivoKey: 'k',
      archivoTipo: 'image/jpeg',
      origenLectura: 'IA_CORREGIDA',
      estadoLectura: 'LEIDA',
      observaciones: null,
      registros: [],
      novedades: [],
      hallazgos: [],
      fechas: [],
      puestoLeido: null,
    });
    prisma.cPBitacoraRegistro.count.mockResolvedValue(2);
    const leidos = jest.requireMock('../../../common/utils/stored-file.util')
      .readStoredFile as jest.Mock;
    leidos.mockResolvedValue(Buffer.from('foto'));

    await servicio.releer(99, ACTOR);

    expect(lector.leer).not.toHaveBeenCalled();
    expect(prisma.cPBitacoraRegistro.deleteMany).not.toHaveBeenCalled();
    const datos = prisma.cPBitacora.update.mock.calls
      .map((c) => c[0].data)
      .find((d: any) => d.mensajeLectura);
    expect(datos.mensajeLectura).toContain(
      'Se conserva lo que ya estaba escrito',
    );
    expect(datos.estadoLectura).toBeUndefined();
  });
});

describe('BitacorasService.subir', () => {
  it('rechaza un archivo que no es foto ni PDF', async () => {
    const { servicio } = montar({});
    await expect(
      servicio.subir({ ...foto, mimetype: 'text/plain' }, 10, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un archivo de más de 15 MB con el tamaño real', async () => {
    const { servicio } = montar({});
    await expect(
      servicio.subir(
        { ...foto, buffer: Buffer.alloc(16 * 1024 * 1024) },
        10,
        ACTOR,
      ),
    ).rejects.toThrow(/16\.0 MB/);
  });

  it('lee con el agente y deja constancia de lo que hizo', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: {
        esBitacora: true,
        puesto: 'Garita norte',
        fechas: ['2026-10-12'],
        registros: [
          {
            fecha: '2026-10-12',
            guardia: 'Juan Pérez',
            horaEntrada: '07:00',
            horaSalida: '19:00',
            legible: true,
          },
        ],
        novedades: [
          {
            fecha: '2026-10-12',
            hora: '09:00',
            guardia: null,
            texto: 'Sin novedad',
            categoria: 'SIN_NOVEDAD',
          },
        ],
        observaciones: null,
      },
      modelo: 'gemini-3.8-flash',
      tokensEntrada: 1500,
      tokensSalida: 200,
      duracionMs: 4200,
    });
    const { servicio, agentRuns, prisma } = montar({ leer });

    await servicio.subir(foto, 10, ACTOR);

    expect(leer).toHaveBeenCalledTimes(1);
    expect(agentRuns.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 4,
        agentScope: 'BITACORAS',
        accion: 'LEER_BITACORA',
        companyId: 1,
        userId: 7,
        userNombre: 'Leidy Barzola',
        entidadTipo: 'CPBitacora',
        entidadId: 99,
        modelo: 'gemini-3.8-flash',
        tokensEntrada: 1500,
        duracionMs: 4200,
        exito: true,
      }),
    );
    expect(estadoGuardado(prisma).estadoLectura).toBe('LEIDA');
  });

  it('si la IA falla guarda la foto sin leer, explica por qué y lo registra como fallo', async () => {
    const leer = jest
      .fn()
      .mockRejectedValue(
        new LecturaBitacoraError(
          'No se pudo conectar con el servicio de lectura.',
          'gemini-3.8-flash',
          900,
        ),
      );
    const { servicio, agentRuns, prisma } = montar({ leer });

    await servicio.subir(foto, 10, ACTOR);

    const guardado = estadoGuardado(prisma);
    expect(guardado.estadoLectura).toBe('ERROR');
    expect(guardado.mensajeLectura).toContain('No se pudo conectar');
    expect(agentRuns.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        exito: false,
        error: expect.stringContaining('No se pudo conectar'),
      }),
    );
  });

  it('con el agente desactivado no llama al lector ni registra actividad', async () => {
    const leer = jest.fn();
    const { servicio, agentRuns, prisma } = montar({
      leer,
      agente: {
        id: 4,
        name: 'Agente Revisor de Bitácoras',
        isActive: false,
        instructions: '',
        scope: 'BITACORAS',
      },
    });

    await servicio.subir(foto, 10, ACTOR);

    expect(leer).not.toHaveBeenCalled();
    expect(agentRuns.registrar).not.toHaveBeenCalled();
    expect(estadoGuardado(prisma).mensajeLectura).toContain('desactivado');
  });

  it('sin IA configurada guarda la foto para transcribirla a mano', async () => {
    const leer = jest.fn();
    const { servicio, prisma } = montar({ leer, iaConfigurada: false });

    await servicio.subir(foto, 10, ACTOR);

    expect(leer).not.toHaveBeenCalled();
    expect(estadoGuardado(prisma).mensajeLectura).toContain(
      'no está configurada',
    );
  });

  it('una imagen que no es una bitácora no se guarda como si lo fuera', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: {
        esBitacora: false,
        puesto: null,
        fechas: [],
        registros: [],
        novedades: [],
        observaciones: 'Es una selfie.',
      },
      modelo: 'm',
      tokensEntrada: 10,
      tokensSalida: 5,
      duracionMs: 100,
    });
    const { servicio, prisma, agentRuns } = montar({ leer });

    await servicio.subir(foto, 10, ACTOR);

    const guardado = estadoGuardado(prisma);
    expect(guardado.estadoLectura).toBe('ERROR');
    expect(guardado.mensajeLectura).toContain('Es una selfie.');
    expect(agentRuns.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ exito: true }),
    );
  });

  it('pasa al lector el texto propio de la empresa, y nada si es el de fábrica', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: {
        esBitacora: true,
        puesto: null,
        fechas: [],
        registros: [],
        novedades: [],
        observaciones: null,
      },
      modelo: 'm',
      tokensEntrada: 1,
      tokensSalida: 1,
      duracionMs: 1,
    });
    const propio = montar({
      leer,
      agente: {
        id: 4,
        name: 'A',
        isActive: true,
        instructions: 'Las columnas son X, Y.',
        scope: 'BITACORAS',
      },
    });
    await propio.servicio.subir(foto, 10, ACTOR);
    expect(leer.mock.calls[0][2]).toBe('Las columnas son X, Y.');

    leer.mockClear();
    const fabrica = montar({ leer });
    await fabrica.servicio.subir(foto, 10, ACTOR);
    expect(leer.mock.calls[0][2]).toBe('');
  });
});
