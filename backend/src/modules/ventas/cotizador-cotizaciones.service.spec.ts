import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { CotizadorCotizacionesService } from './cotizador-cotizaciones.service';

// Las reglas de quién ve y quién modifica una cotización son las del cotizador original (sus políticas
// de seguridad). Aquí se comprueba que el servicio las aplica; la prueba de punta a punta contra una base
// real se hizo aparte.

const quote = (extra: Record<string, unknown> = {}) => ({
  id: 10,
  companyId: 1,
  ownerId: 1,
  vendorName: 'Dueño',
  quoteNumber: 'COT-20261015-0001',
  quoteDate: new Date('2026-10-15T00:00:00Z'),
  client: {},
  items: [],
  status: 'borrador',
  installMargin: 35,
  supplierMargins: {},
  discountType: 'none',
  discountValue: 0,
  conditions: '',
  notes: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

const actor = (userId: number, role = 'EMPLOYEE') => ({
  userId,
  role,
  companyId: 1,
});

function build() {
  const mock = {
    cotQuote: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    cotQuoteShare: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    cotEditGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Alguien' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new CotizadorCotizacionesService(
    mock as unknown as PrismaService,
  );
  return { mock, service };
}

describe('CotizadorCotizacionesService - quién ve qué', () => {
  it('un vendedor ve las suyas, las compartidas con él y las de quien le dio edición total', async () => {
    const { mock, service } = build();
    mock.cotQuoteShare.findMany.mockResolvedValue([{ quoteId: 7 }]);
    mock.cotEditGrant.findMany.mockResolvedValue([{ ownerId: 3 }]);
    await service.listar(actor(5));
    const where = mock.cotQuote.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(1);
    expect(where.OR).toEqual([
      { ownerId: 5 },
      { id: { in: [7] } },
      { ownerId: { in: [3] } },
    ]);
  });

  it('el administrador de la empresa ve todas las de su empresa', async () => {
    const { mock, service } = build();
    await service.listar(actor(9, 'ADMIN'));
    expect(mock.cotQuote.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
    });
  });

  it('el acceso de cada cotización listada: dueño, edición total, compartida o administrador', async () => {
    const { mock, service } = build();
    mock.cotQuoteShare.findMany.mockResolvedValue([{ quoteId: 12 }]);
    mock.cotEditGrant.findMany.mockResolvedValue([{ ownerId: 3 }]);
    mock.cotQuote.findMany.mockResolvedValue([
      quote({ id: 11, ownerId: 5 }),
      quote({ id: 12, ownerId: 4 }),
      quote({ id: 13, ownerId: 3 }),
      quote({ id: 14, ownerId: 8 }),
    ]);
    const r = await service.listar(actor(5, 'ADMIN'));
    expect(r.map((q) => q.access)).toEqual([
      'owner',
      'shared',
      'editor',
      'admin',
    ]);
  });

  it('una cotización ajena responde 404 (no revela que existe)', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 1 }));
    await expect(service.obtener(actor(5), 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('una cotización de otra empresa o inexistente responde 404', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(null);
    await expect(service.obtener(actor(1), 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mock.cotQuote.findFirst.mock.calls[0][0].where).toEqual({
      id: 99,
      companyId: 1,
    });
  });
});

describe('CotizadorCotizacionesService - quién modifica', () => {
  it('con una cotización compartida NO se puede modificar ni cambiar el estado ni eliminar', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 1 }));
    mock.cotQuoteShare.findMany.mockResolvedValue([{ sharedWithId: 5 }]);
    await expect(
      service.actualizar(actor(5), 10, { notes: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.cambiarEstado(actor(5), 10, { status: 'aceptada' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.eliminar(actor(5), 10)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mock.cotQuote.update).not.toHaveBeenCalled();
    expect(mock.cotQuote.delete).not.toHaveBeenCalled();
  });

  it('el administrador la ve pero NO la modifica ni la elimina (igual que el original)', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 1 }));
    await expect(
      service.actualizar(actor(9, 'ADMIN'), 10, { notes: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.eliminar(actor(9, 'ADMIN'), 10),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('con edición total se modifica y se cambia el estado, pero NO se elimina ni se comparte', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 1 }));
    mock.cotEditGrant.findMany.mockResolvedValue([{ editorId: 5 }]);
    mock.cotQuote.update.mockResolvedValue(quote({ ownerId: 1, notes: 'x' }));
    await service.actualizar(actor(5), 10, { notes: 'x' });
    expect(mock.cotQuote.update).toHaveBeenCalledTimes(1);
    // el dueño y su nombre NO se tocan
    const data = mock.cotQuote.update.mock.calls[0][0].data;
    expect(data.ownerId).toBeUndefined();
    expect(data.vendorName).toBeUndefined();
    await expect(service.eliminar(actor(5), 10)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.compartir(actor(5), 10, 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('el dueño sí elimina su cotización', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 5 }));
    await service.eliminar(actor(5), 10);
    expect(mock.cotQuote.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});

describe('CotizadorCotizacionesService - compartir', () => {
  it('no se puede compartir con uno mismo ni con alguien que no es de la empresa', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 5 }));
    await expect(service.compartir(actor(5), 10, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    mock.user.findFirst.mockResolvedValue(null);
    await expect(service.compartir(actor(5), 10, 77)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mock.cotQuoteShare.upsert).not.toHaveBeenCalled();
  });

  it('solo se busca entre usuarios ACTIVOS de la misma empresa', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ ownerId: 5 }));
    mock.user.findFirst.mockResolvedValue({ id: 7, fullName: 'Otro' });
    await service.compartir(actor(5), 10, 7);
    expect(mock.user.findFirst.mock.calls[0][0].where).toEqual({
      id: 7,
      companyId: 1,
      isActive: true,
    });
    expect(mock.cotQuoteShare.upsert).toHaveBeenCalledTimes(1);
  });

  it('dar edición total: no a uno mismo', async () => {
    const { service } = build();
    await expect(service.darAccesoEdicion(actor(5), 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CotizadorCotizacionesService - número de cotización', () => {
  it('verificarNumero: libre', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(null);
    expect(await service.verificarNumero(actor(5), 'COT-X')).toEqual({
      existe: false,
      existingId: null,
    });
  });

  it('verificarNumero: existe y es tuya -> devuelve su id; ajena -> existe pero sin id', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ id: 33, ownerId: 5 }));
    expect(await service.verificarNumero(actor(5), 'COT-X')).toEqual({
      existe: true,
      existingId: 33,
    });
    mock.cotQuote.findFirst.mockResolvedValue(quote({ id: 34, ownerId: 1 }));
    expect(await service.verificarNumero(actor(5), 'COT-X')).toEqual({
      existe: true,
      existingId: null,
    });
  });

  it('crear con un número ya usado responde 409 con un mensaje claro', async () => {
    const { mock, service } = build();
    mock.cotQuote.findFirst.mockResolvedValue(quote({ id: 33, ownerId: 5 }));
    await expect(
      service.crear(actor(5), {
        quoteNumber: 'COT-20261015-0001',
        client: { name: 'A', ruc: '1', phone: '1', email: 'a@a.com' },
        items: [{ code: 'EQ-0001', qty: 1 }],
      }),
    ).rejects.toThrow(/Ya existe la cotización/);
  });
});
