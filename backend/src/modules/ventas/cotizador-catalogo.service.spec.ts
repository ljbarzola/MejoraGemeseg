import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  };
  const mock: Record<string, any> = {
    ...tx,
    cotProduct: { ...tx.cotProduct, updateMany: jest.fn() },
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
    const r = await service.crearProducto(1, {
      kind: 'EQUIPO',
      name: ' Cámara nueva ',
      unitCost: 5,
    });
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
    await service.crearProducto(1, {
      kind: 'SERVICIO',
      name: 'Monitoreo',
      hasProfit: true,
      hasInstall: true,
    });
    expect(tx.cotProduct.create.mock.calls[0][0].data).toMatchObject({
      hasProfit: false,
      hasInstall: false,
      unit: 'servicio',
    });
  });

  it('sin nombre se rechaza', async () => {
    const { service } = build();
    await expect(
      service.crearProducto(1, { kind: 'EQUIPO', name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"eliminar" desactiva (isActive = false), no borra; si no existe, 404', async () => {
    const { mock, service } = build();
    mock.cotProduct.updateMany.mockResolvedValue({ count: 1 });
    await service.desactivarProducto(1, 5);
    expect(mock.cotProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 5, companyId: 1 },
      data: { isActive: false },
    });
    mock.cotProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.desactivarProducto(1, 6)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('un producto desactivado ya no se edita', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto({ isActive: false }));
    await expect(
      service.actualizarProducto(1, 1, { name: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cotProduct.update).not.toHaveBeenCalled();
  });

  it('al editar nunca se cambia el código ni el tipo', async () => {
    const { tx, service } = build();
    tx.cotProduct.findFirst.mockResolvedValue(producto());
    tx.cotProduct.update.mockResolvedValue(producto({ unitCost: 99 }));
    await service.actualizarProducto(1, 1, { unitCost: 99 });
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
