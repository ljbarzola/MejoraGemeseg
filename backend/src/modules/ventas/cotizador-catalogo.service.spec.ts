import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { CotizadorCatalogoService } from './cotizador-catalogo.service';

// Reglas del catálogo: el código lo asigna el servidor (último + 1, nunca se reutiliza) y "borrar" solo desactiva.

const producto = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  companyId: 1,
  kind: 'EQUIPO',
  code: 'EQ-0001',
  category: '',
  subcategory: '',
  model: '',
  name: 'Cámara',
  description: '',
  unit: 'u',
  defaultQty: 1,
  unitCost: 10,
  monthlyCost: 0,
  annualCost: 0,
  hasProfit: true,
  hasInstall: true,
  supplier: '',
  lastUpdate: null,
  notes: '',
  minPrice: null,
  isActive: true,
  ...extra,
});

function build() {
  const tx: Record<string, any> = {
    $queryRaw: jest.fn(),
    cotProduct: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cotCounter: { findUnique: jest.fn() },
    cotCambio: { createMany: jest.fn() },
  };
  const mock: Record<string, any> = {
    ...tx,
    cotProduct: { ...tx.cotProduct, updateMany: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Ana Pérez' }),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new CotizadorCatalogoService(
    mock as unknown as PrismaService,
  );
  return { tx, mock, service };
}

describe('CotizadorCatalogoService - códigos', () => {
  it('reserva el siguiente: con el mayor existente 402, el contador entrega 403 -> EQ-0403', async () => {
    const { tx, service } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 402 }])
      .mockResolvedValueOnce([{ lastSeq: 403 }]);
    expect(await service.reservarCodigo(tx as never, 1, 'EQUIPO')).toBe(
      'EQ-0403',
    );
  });

  it('si se borró el último, el contador (que solo sube) evita reutilizar su código', async () => {
    const { tx, service } = build();
    // el mayor que queda es 402, pero el contador ya iba en 405: el UPSERT devuelve 406
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 402 }])
      .mockResolvedValueOnce([{ lastSeq: 406 }]);
    expect(await service.reservarCodigo(tx as never, 1, 'EQUIPO')).toBe(
      'EQ-0406',
    );
  });

  it('las instalaciones llevan 3 dígitos', async () => {
    const { tx, service } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 56 }])
      .mockResolvedValueOnce([{ lastSeq: 57 }]);
    expect(await service.reservarCodigo(tx as never, 1, 'INSTALACION')).toBe(
      'INST-057',
    );
  });

  it('consultar el siguiente código NO escribe nada', async () => {
    const { tx, service } = build();
    tx.$queryRaw.mockResolvedValueOnce([{ m: 402 }]);
    tx.cotCounter.findUnique.mockResolvedValue({ lastSeq: 405 });
    expect(await service.siguienteCodigo(1, 'EQUIPO')).toEqual({
      code: 'EQ-0406',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1); // solo la lectura del máximo
  });
});

describe('CotizadorCatalogoService - productos', () => {
  it('al crear usa el código reservado y no deja teclear uno', async () => {
    const { tx, service } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 402 }])
      .mockResolvedValueOnce([{ lastSeq: 403 }]);
    tx.cotProduct.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(producto(data)),
    );
    const r = await service.crearProducto(
      1,
      { kind: 'EQUIPO', name: ' Cámara nueva ', unitCost: 5 },
      7,
    );
    expect(r.code).toBe('EQ-0403');
    expect(tx.cotProduct.create.mock.calls[0][0].data).toMatchObject({
      companyId: 1,
      code: 'EQ-0403',
      name: 'Cámara nueva',
    });
  });

  it('un servicio nunca lleva ganancia ni instalación', async () => {
    const { tx, service } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 30 }])
      .mockResolvedValueOnce([{ lastSeq: 31 }]);
    tx.cotProduct.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(producto(data)),
    );
    await service.crearProducto(
      1,
      { kind: 'SERVICIO', name: 'Monitoreo', hasProfit: true, hasInstall: true },
      7,
    );
    expect(tx.cotProduct.create.mock.calls[0][0].data).toMatchObject({
      hasProfit: false,
      hasInstall: false,
      unit: 'servicio',
    });
  });

  it('sin nombre se rechaza', async () => {
    const { service } = build();
    await expect(
      service.crearProducto(1, { kind: 'EQUIPO', name: '   ' }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"eliminar" desactiva (isActive = false), no borra; si no existe, 404', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ id: 5 }));
    await service.desactivarProducto(1, 5, 7);
    expect(tx.cotProduct.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isActive: false },
    });
    tx.cotProduct.findFirst.mockResolvedValue(null);
    await expect(service.desactivarProducto(1, 6, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('un producto desactivado ya no se edita', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ isActive: false }));
    await expect(
      service.actualizarProducto(1, 1, { name: 'x' }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cotProduct.update).not.toHaveBeenCalled();
  });

  it('al editar nunca se cambia el código ni el tipo', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto());
    tx.cotProduct.update.mockResolvedValue(producto({ unitCost: 99 }));
    await service.actualizarProducto(1, 1, { unitCost: 99 }, 7);
    const data = tx.cotProduct.update.mock.calls[0][0].data;
    expect(data.code).toBeUndefined();
    expect(data.kind).toBeUndefined();
    expect(data.unitCost).toBe(99);
  });

  it('exige empresa (el super administrador sin empresa no usa el Cotizador)', async () => {
    const { service } = build();
    await expect(service.catalogo(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CotizadorCatalogoService - historial de cambios', () => {
  it('al cambiar el costo anota UN renglón con quién, antes y después', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ unitCost: 85 }));
    tx.cotProduct.update.mockResolvedValue(producto({ unitCost: 92 }));
    await service.actualizarProducto(1, 1, { unitCost: 92 }, 7);
    expect(tx.cotCambio.createMany).toHaveBeenCalledTimes(1);
    expect(tx.cotCambio.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        companyId: 1,
        entidad: 'PRODUCTO',
        codigo: 'EQ-0001',
        accion: 'EDITO',
        campo: 'unitCost',
        valorAntes: '85',
        valorDespues: '92',
        userId: 7,
        userNombre: 'Ana Pérez',
      }),
    ]);
  });

  it('si se guarda sin cambiar nada, no se anota nada', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto());
    tx.cotProduct.update.mockResolvedValue(producto());
    await service.actualizarProducto(1, 1, { name: 'Cámara' }, 7);
    expect(tx.cotCambio.createMany).not.toHaveBeenCalled();
  });

  it('crear anota «CREO» y eliminar anota «ELIMINO»; eliminar uno ya desactivado no repite', async () => {
    const { tx, service } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 402 }])
      .mockResolvedValueOnce([{ lastSeq: 403 }]);
    tx.cotProduct.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(producto({ id: 9, ...data })),
    );
    await service.crearProducto(1, { kind: 'EQUIPO', name: 'Nueva' }, 7);
    expect(tx.cotCambio.createMany.mock.calls[0][0].data[0]).toMatchObject({
      accion: 'CREO',
      codigo: 'EQ-0403',
      campo: '',
    });

    tx.cotCambio.createMany.mockClear();
    tx.cotProduct.findFirst.mockResolvedValue(producto());
    await service.desactivarProducto(1, 1, 7);
    expect(tx.cotCambio.createMany.mock.calls[0][0].data[0]).toMatchObject({
      accion: 'ELIMINO',
    });

    tx.cotCambio.createMany.mockClear();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ isActive: false }));
    await service.desactivarProducto(1, 1, 7);
    expect(tx.cotCambio.createMany).not.toHaveBeenCalled();
  });

  it('si anotar falla, el error se propaga (misma transacción: el cambio tampoco queda)', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto());
    tx.cotProduct.update.mockResolvedValue(producto({ unitCost: 99 }));
    tx.cotCambio.createMany.mockRejectedValue(new Error('fallo'));
    await expect(
      service.actualizarProducto(1, 1, { unitCost: 99 }, 7),
    ).rejects.toThrow('fallo');
  });

  it('el lote anota cada cambio y solo desactiva (y anota) los que seguían activos', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ unitCost: 10 }));
    tx.cotProduct.update.mockResolvedValue(producto({ unitCost: 12 }));
    tx.cotProduct.findMany = jest
      .fn()
      .mockResolvedValue([producto({ id: 4, code: 'EQ-0004' })]);
    tx.cotProduct.updateMany.mockResolvedValue({ count: 1 });
    const r = await service.lote(
      1,
      {
        productos: { cambios: [{ id: 1, unitCost: 12 }], borrados: [4, 5] },
      } as never,
      7,
    );
    expect(r.productosEditados).toBe(1);
    expect(r.productosDesactivados).toBe(1);
    const acciones = tx.cotCambio.createMany.mock.calls.map(
      (c: any[]) => c[0].data[0].accion,
    );
    expect(acciones).toEqual(['EDITO', 'ELIMINO']);
  });
});

describe('CotizadorCatalogoService - precio mínimo y límites', () => {
  const comoRol = (mock: Record<string, any>, role: string) =>
    mock.user.findUnique.mockResolvedValue({ fullName: 'Ana Pérez', role });

  it('un vendedor no puede fijar el precio mínimo al crear; un administrador sí', async () => {
    const { tx, mock, service } = build();
    comoRol(mock, 'EMPLOYEE');
    await expect(
      service.crearProducto(
        1,
        { kind: 'EQUIPO', name: 'X', minPrice: 50 },
        7,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    comoRol(mock, 'ADMIN');
    tx.$queryRaw
      .mockResolvedValueOnce([{ m: 1 }])
      .mockResolvedValueOnce([{ lastSeq: 2 }]);
    tx.cotProduct.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(producto(data)),
    );
    await service.crearProducto(1, { kind: 'EQUIPO', name: 'X', minPrice: 50 }, 7);
    expect(tx.cotProduct.create.mock.calls[0][0].data.minPrice).toBe(50);
  });

  it('un vendedor puede guardar un producto que ya tiene mínimo si no lo cambia, pero no cambiarlo', async () => {
    const { tx, mock, service } = build();
    comoRol(mock, 'EMPLOYEE');
    tx.cotProduct.findFirst.mockResolvedValue(
      producto({ minPrice: '90.0000' }),
    );
    tx.cotProduct.update.mockResolvedValue(
      producto({ minPrice: '90.0000', unitCost: 11 }),
    );
    await service.actualizarProducto(1, 1, { unitCost: 11, minPrice: 90 }, 7);
    await expect(
      service.actualizarProducto(1, 1, { minPrice: 60 }, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.actualizarProducto(1, 1, { minPrice: null }, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un cambio de precio mínimo queda en el historial', async () => {
    const { tx, mock, service } = build();
    comoRol(mock, 'MANAGER');
    tx.cotProduct.findFirst.mockResolvedValue(producto({ minPrice: null }));
    tx.cotProduct.update.mockResolvedValue(producto({ minPrice: 75 }));
    await service.actualizarProducto(1, 1, { minPrice: 75 }, 7);
    expect(tx.cotCambio.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        campo: 'minPrice',
        valorAntes: null,
        valorDespues: '75',
      }),
    ]);
  });

  it('sin límites guardados, todo viene vacío (sin límite)', async () => {
    const { mock, service } = build();
    mock.cotLimites = { findUnique: jest.fn().mockResolvedValue(null) };
    expect(await service.obtenerLimites(1)).toEqual({
      maxDescuentoPct: null,
      maxDescuentoServiciosPct: null,
      minGananciaPct: null,
    });
  });

  it('guardar límites convierte vacío en «sin límite» y los números llegan como número', async () => {
    const { mock, service } = build();
    mock.cotLimites = {
      upsert: jest.fn().mockImplementation(({ create }: any) =>
        Promise.resolve({
          maxDescuentoPct: '10.00',
          maxDescuentoServiciosPct: create.maxDescuentoServiciosPct,
          minGananciaPct: '12.50',
        }),
      ),
    };
    const r = await service.guardarLimites(
      1,
      { maxDescuentoPct: 10, minGananciaPct: 12.5 },
      7,
    );
    expect(mock.cotLimites.upsert.mock.calls[0][0].create).toMatchObject({
      companyId: 1,
      maxDescuentoServiciosPct: null,
      updatedBy: 7,
    });
    expect(r).toEqual({
      maxDescuentoPct: 10,
      maxDescuentoServiciosPct: null,
      minGananciaPct: 12.5,
    });
  });

  it('los límites exigen empresa', async () => {
    const { service } = build();
    await expect(service.obtenerLimites(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CotizadorCatalogoService - leer el historial', () => {
  function conHistorial(filas: unknown[] = []) {
    const { mock, service } = build();
    mock.cotCambio = {
      count: jest.fn().mockResolvedValue(filas.length),
      findMany: jest.fn().mockResolvedValue(filas),
    };
    return { mock, service };
  }

  it('filtra por la empresa y pone lo más reciente primero', async () => {
    const { mock, service } = conHistorial();
    await service.historial(1, {});
    expect(mock.cotCambio.findMany.mock.calls[0][0]).toMatchObject({
      where: { companyId: 1 },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  });

  it('el filtro «precio» solo trae ediciones de campos de precio; «datos», el resto', async () => {
    const { mock, service } = conHistorial();
    await service.historial(1, { tipo: 'precio' });
    const w1 = mock.cotCambio.findMany.mock.calls[0][0].where;
    expect(w1.accion).toBe('EDITO');
    expect(w1.campo.in).toContain('unitCost');
    await service.historial(1, { tipo: 'datos' });
    const w2 = mock.cotCambio.findMany.mock.calls[1][0].where;
    expect(w2.campo.notIn).toContain('unitCost');
  });

  it('las fechas se toman como días de Ecuador (UTC-5): «hasta» incluye todo ese día', async () => {
    const { mock, service } = conHistorial();
    await service.historial(1, { desde: '2026-11-12', hasta: '2026-11-12' });
    const r = mock.cotCambio.findMany.mock.calls[0][0].where.creadoEn;
    expect(r.gte.toISOString()).toBe('2026-11-12T05:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2026-11-13T05:00:00.000Z');
  });

  it('devuelve etiqueta y tipo del campo para mostrarlo en español', async () => {
    const { service } = conHistorial([
      {
        id: 1,
        creadoEn: new Date(),
        entidad: 'PRODUCTO',
        entidadId: 1,
        codigo: 'EQ-0001',
        nombre: 'Cámara',
        accion: 'EDITO',
        campo: 'unitCost',
        valorAntes: '85',
        valorDespues: '92',
        userId: 7,
        userNombre: 'Ana Pérez',
      },
    ]);
    const r = await service.historial(1, {});
    expect(r.items[0]).toMatchObject({
      campoEtiqueta: 'Costo unitario',
      campoTipo: 'dinero',
      esPrecio: true,
    });
  });

  it('exige empresa', async () => {
    const { service } = conHistorial();
    await expect(service.historial(null, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
