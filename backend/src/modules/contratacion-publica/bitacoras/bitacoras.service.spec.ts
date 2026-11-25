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
        contratoId: 3,
        dotacion: [],
        registros: [],
        novedades: [],
        hallazgos: [],
        fechas: [],
        puestoLeido: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cPAusencia: { findMany: jest.fn().mockResolvedValue([]) },
    cPContrato: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
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
    cPBitacoraDotacion: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    cPPuestoDotacion: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    cPBitacoraArticuloAmbito: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    cPEntidadPublica: { findFirst: jest.fn().mockResolvedValue({ tipo: 'PUBLICA' }) },
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
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    getCompanyUserIdsWithWriteAccess: jest.fn().mockResolvedValue([]),
  };
  const servicio = new BitacorasService(
    prisma as unknown as PrismaService,
    lector as any,
    agentRuns as any,
    notifications as any,
    permissions as any,
  );
  return { servicio, prisma, lector, agentRuns, notifications, permissions };
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
      contratoId: 3,
      dotacion: [],
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

describe('BitacorasService.dotación de la hoja (etapa 1 y 2)', () => {
  const hojaConDotacion = (dotacion: unknown[]) => ({
    id: 99,
    companyId: 1,
    puestoId: 10,
    contratoId: 3,
    puestoNombre: 'Garita norte',
    entidadId: 5,
    entidadNombre: 'Municipio de Ejemplo',
    archivoKey: null,
    archivoTipo: null,
    origenLectura: 'IA',
    estadoLectura: 'LEIDA',
    observaciones: null,
    puestoLeido: null,
    fechas: [],
    registros: [],
    novedades: [],
    hallazgos: [],
    dotacion,
  });

  it('pide la dotación al lector solo en contratos de entidades públicas', async () => {
    for (const [tipo, esperado] of [
      ['PUBLICA', 'PUBLICA'],
      ['PRIVADA', 'PRIVADA'],
    ] as const) {
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
      const { servicio, prisma } = montar({ leer });
      prisma.cPEntidadPublica.findFirst.mockResolvedValue({ tipo });
      await servicio.subir(foto, 10, ACTOR);
      expect(leer.mock.calls[0][4]).toBe(esperado);
    }
  });

  it('si no se puede saber el tipo de entidad no se pide dotación (no se adivina)', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: { esBitacora: true, puesto: null, fechas: [], registros: [], novedades: [], observaciones: null },
      modelo: 'm',
      tokensEntrada: 1,
      tokensSalida: 1,
      duracionMs: 1,
    });
    const { servicio, prisma } = montar({ leer });
    prisma.cPEntidadPublica.findFirst.mockRejectedValue(new Error('caído'));
    await servicio.subir(foto, 10, ACTOR);
    expect(leer.mock.calls[0][4]).toBeUndefined();
  });

  it('completa de quién es cada artículo con lo que la empresa ya corrigió antes', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: {
        esBitacora: true,
        puesto: null,
        fechas: [],
        registros: [],
        novedades: [],
        observaciones: null,
        dotacion: [{ ambito: 'SIN_DATO', articulo: 'Tachos de basura', cantidad: 2, detalle: null }],
      },
      modelo: 'm',
      tokensEntrada: 1,
      tokensSalida: 1,
      duracionMs: 1,
    });
    const { servicio, prisma } = montar({ leer });
    prisma.cPBitacoraArticuloAmbito.findMany.mockResolvedValue([{ clave: 'TACHO DE BASURA', ambito: 'CLIENTE' }]);
    await servicio.subir(foto, 10, ACTOR);
    const filas = prisma.cPBitacoraDotacion.createMany.mock.calls[0][0].data;
    expect(filas).toEqual([expect.objectContaining({ articulo: 'Tachos de basura', ambito: 'CLIENTE', cantidad: 2 })]);
  });

  it('si la lectura no trae dotación (contrato privado) no se toca la que hubiera guardada', async () => {
    const leer = jest.fn().mockResolvedValue({
      lectura: { esBitacora: true, puesto: null, fechas: [], registros: [], novedades: [], observaciones: null },
      modelo: 'm',
      tokensEntrada: 1,
      tokensSalida: 1,
      duracionMs: 1,
    });
    const { servicio, prisma } = montar({ leer });
    await servicio.subir(foto, 10, ACTOR);
    expect(prisma.cPBitacoraDotacion.deleteMany).not.toHaveBeenCalled();
  });

  it('una persona clasifica un artículo nuevo: queda en la lista del puesto, en la hoja y se recuerda', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPBitacora.findFirst.mockResolvedValue(hojaConDotacion([]));
    prisma.cPBitacoraDotacion.findFirst.mockResolvedValue({ id: 5, bitacoraId: 99, articulo: 'Tablero', cantidad: 1, detalle: null });
    await servicio.clasificarDotacion(99, 5, 'CLIENTE', ACTOR);
    expect(prisma.cPBitacoraDotacion.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { ambito: 'CLIENTE' } });
    expect(prisma.cPPuestoDotacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 1, puestoId: 10, bitacoraId: 99, ambito: 'CLIENTE', articulo: 'Tablero', cantidad: 1 }),
    });
    expect(prisma.cPBitacoraArticuloAmbito.upsert).toHaveBeenCalled();
  });

  it('al clasificar de nuevo un artículo reemplaza el que ya estaba en la lista del puesto', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPBitacora.findFirst.mockResolvedValue(hojaConDotacion([]));
    prisma.cPBitacoraDotacion.findFirst.mockResolvedValue({ id: 5, bitacoraId: 99, articulo: 'Tablero', cantidad: 2, detalle: null });
    prisma.cPPuestoDotacion.findMany.mockResolvedValue([{ id: 40, articulo: 'tableros', ambito: 'CLIENTE', cantidad: 1 }]);
    await servicio.clasificarDotacion(99, 5, 'GEMESEG', ACTOR);
    expect(prisma.cPPuestoDotacion.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [40] } } });
  });

  it('solo se puede clasificar como de Gemeseg o del cliente', async () => {
    const { servicio, prisma } = montar({});
    await expect(servicio.clasificarDotacion(99, 5, 'OTRO', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.cPPuestoDotacion.create).not.toHaveBeenCalled();
  });

  it('un artículo que no es de esa hoja no se puede clasificar', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPBitacoraDotacion.findFirst.mockResolvedValue(null);
    await expect(servicio.clasificarDotacion(99, 5, 'CLIENTE', ACTOR)).rejects.toThrow('Artículo no encontrado en esta hoja.');
  });

  it('quitar de la dotación del puesto solo borra una fila de ESE puesto', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPBitacora.findFirst.mockResolvedValue(hojaConDotacion([]));
    await servicio.quitarDeLaDotacionDelPuesto(99, 40, ACTOR);
    expect(prisma.cPPuestoDotacion.deleteMany).toHaveBeenCalledWith({ where: { id: 40, companyId: 1, puestoId: 10 } });
  });

  it('al guardar, la dotación de la hoja se compara con la del puesto y con Inventario, y marca lo nuevo', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPBitacora.findFirst.mockResolvedValue(hojaConDotacion([]));
    prisma.cPPuestoDotacion.findMany.mockResolvedValue([{ ambito: 'GEMESEG', articulo: 'Radios', cantidad: 2 }]);
    (servicio as any).inventario = {
      inventarioPorContrato: jest.fn().mockResolvedValue([{ puestoId: 10, totalArmas: 2, chalecos: 0, equipo: [] }]),
    };
    await servicio.guardarLectura(
      99,
      {
        registros: [],
        novedades: [],
        dotacion: [
          { ambito: 'GEMESEG', articulo: 'Radios', cantidad: 1 },
          { ambito: 'SIN_DATO', articulo: 'Tablero', cantidad: 1 },
        ],
      } as any,
      ACTOR,
    );
    const hallazgos = prisma.cPBitacoraHallazgo.createMany.mock.calls[0][0].data;
    const tipos = hallazgos.map((h: any) => h.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['DOTACION_DIFERENTE', 'DOTACION_INVENTARIO', 'DOTACION_NUEVO']));
    expect(Math.max(...hallazgos.map((h: any) => ['BAJA', 'MEDIA', 'ALTA'].indexOf(h.severidad)))).toBeLessThanOrEqual(1);
  });
});

describe('BitacorasService.datosHojaEnBlanco', () => {
  const puestoDe = (tipo: string) => ({
    id: 10,
    nombre: 'Garita norte',
    contratoId: 3,
    contrato: { numero: 'CTR-1', entidad: { nombre: 'Municipio', tipo } },
  });

  it('en una entidad pública ofrece la hoja con dotación y trae la dotación inicial', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puestoDe('PUBLICA'));
    prisma.cPPuestoDotacion.findMany.mockResolvedValue([{ ambito: 'CLIENTE', articulo: 'Tachos de basura', cantidad: 2 }]);
    (servicio as any).inventario = {
      inventarioPorContrato: jest
        .fn()
        .mockResolvedValue([{ puestoId: 10, totalArmas: 1, chalecos: 2, equipo: [{ articulo: 'Radio', cantidad: 2, clase: 'OTRO' }] }]),
    };
    const d = await servicio.datosHojaEnBlanco(1, 10);
    expect(d.tipo).toBe('PUBLICA');
    // Lo que Gemeseg manda (Inventario) y lo ya clasificado del cliente salen impresos como «Inicial».
    expect(d.dotacionBase.map((x) => [x.articulo, x.cantidad])).toEqual([
      ['Armas', 1],
      ['Chalecos', 2],
      ['Radio', 2],
      ['Tachos de basura', 2],
    ]);
    expect(d.puestoNombre).toBe('Garita norte');
  });

  it('en una entidad privada ofrece la hoja estándar, sin dotación', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puestoDe('PRIVADA'));
    const d = await servicio.datosHojaEnBlanco(1, 10);
    expect(d.tipo).toBe('ESTANDAR');
    expect(d.dotacionBase).toEqual([]);
    expect(prisma.cPPuestoDotacion.findMany).not.toHaveBeenCalled();
  });

  it('la persona puede elegir el formato aunque la entidad sugiera otro', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puestoDe('PUBLICA'));
    expect((await servicio.datosHojaEnBlanco(1, 10, 'ESTANDAR')).tipo).toBe('ESTANDAR');
  });

  it('un puesto que no existe da error claro', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(null);
    await expect(servicio.datosHojaEnBlanco(1, 999)).rejects.toThrow('Puesto de servicio no encontrado.');
  });
});


describe('BitacorasService.dotación del puesto cargada a mano', () => {
  const puesto = { id: 10, nombre: 'Garita norte', contratoId: 3, contrato: { numero: 'CTR-1', entidad: { nombre: 'Municipio' } } };

  it('agrega un artículo del cliente a la lista del puesto, antes de cualquier hoja', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puesto);
    await servicio.agregarADotacionDelPuesto(1, 10, { ambito: 'CLIENTE', articulo: '  Tablero   de llaves ', cantidad: 1 });
    expect(prisma.cPPuestoDotacion.create).toHaveBeenCalledWith({
      data: { companyId: 1, puestoId: 10, ambito: 'CLIENTE', articulo: 'Tablero de llaves', cantidad: 1, orden: 0 },
    });
    // La clasificación queda recordada para que las hojas que lo traigan ya sepan de quién es.
    expect(prisma.cPBitacoraArticuloAmbito.upsert).toHaveBeenCalled();
  });

  it('si el artículo ya estaba (aunque en plural), lo actualiza en vez de duplicarlo', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puesto);
    prisma.cPPuestoDotacion.findMany.mockResolvedValue([{ id: 40, articulo: 'Tachos de basura', ambito: 'CLIENTE', cantidad: 1, orden: 0 }]);
    await servicio.agregarADotacionDelPuesto(1, 10, { ambito: 'CLIENTE', articulo: 'Tacho de basura', cantidad: 3 });
    expect(prisma.cPPuestoDotacion.create).not.toHaveBeenCalled();
    expect(prisma.cPPuestoDotacion.update).toHaveBeenCalledWith({
      where: { id: 40 },
      data: { ambito: 'CLIENTE', articulo: 'Tacho de basura', cantidad: 3 },
    });
  });

  it('no acepta un artículo vacío', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puesto);
    await expect(servicio.agregarADotacionDelPuesto(1, 10, { ambito: 'GEMESEG', articulo: '   ', cantidad: null })).rejects.toThrow('Escribe el nombre del artículo.');
  });

  it('edita y quita solo filas de ese puesto y de esa empresa', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puesto);
    prisma.cPPuestoDotacion.findFirst.mockResolvedValue({ id: 40, ambito: 'CLIENTE', articulo: 'Tablero', cantidad: 1 });
    await servicio.editarDotacionDelPuesto(1, 10, 40, { cantidad: 2 });
    expect(prisma.cPPuestoDotacion.findFirst).toHaveBeenCalledWith({ where: { id: 40, companyId: 1, puestoId: 10 } });
    expect(prisma.cPPuestoDotacion.update).toHaveBeenCalledWith({ where: { id: 40 }, data: { cantidad: 2 } });
    await servicio.quitarDotacionDelPuesto(1, 10, 40);
    expect(prisma.cPPuestoDotacion.deleteMany).toHaveBeenCalledWith({ where: { id: 40, companyId: 1, puestoId: 10 } });
  });

  it('editar o quitar una fila que no es de ese puesto da error claro', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(puesto);
    prisma.cPPuestoDotacion.findFirst.mockResolvedValue(null);
    prisma.cPPuestoDotacion.deleteMany.mockResolvedValue({ count: 0 });
    await expect(servicio.editarDotacionDelPuesto(1, 10, 99, { cantidad: 2 })).rejects.toThrow('Ese artículo no está en la dotación de este puesto.');
    await expect(servicio.quitarDotacionDelPuesto(1, 10, 99)).rejects.toThrow('Ese artículo no está en la dotación de este puesto.');
  });

  it('un puesto que no existe da error claro', async () => {
    const { servicio, prisma } = montar({});
    prisma.cPPuestoServicio.findFirst.mockResolvedValue(null);
    await expect(servicio.dotacionDelPuesto(1, 999)).rejects.toThrow('Puesto de servicio no encontrado.');
  });
});
