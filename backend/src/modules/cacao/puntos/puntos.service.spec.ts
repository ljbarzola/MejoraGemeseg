import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoPuntosService } from './puntos.service';

function armar() {
  const prisma = {
    cacaoPunto: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cacaoReception: { count: jest.fn().mockResolvedValue(0) },
  };
  const service = new CacaoPuntosService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CacaoPuntosService', () => {
  it('la lista de los formularios solo trae los activos, y la de configuración todos', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findMany.mockResolvedValue([]);
    await service.list(4);
    await service.list(4, false);
    const [formularios, configuracion] = prisma.cacaoPunto.findMany.mock
      .calls as Array<[{ where: Record<string, unknown> }]>;
    expect(formularios[0].where).toEqual({ companyId: 4, activo: true });
    expect(configuracion[0].where).toEqual({ companyId: 4 });
  });

  it('muestra cuántas recepciones tiene cada punto', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findMany.mockResolvedValue([
      { id: 1, nombre: 'Norte', _count: { receptions: 3 } },
    ]);
    expect(await service.list(4)).toEqual([
      { id: 1, nombre: 'Norte', recepciones: 3 },
    ]);
  });

  it('no repite el nombre dentro de la empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findFirst.mockResolvedValue({ id: 2 });
    await expect(service.create(4, { nombre: 'norte' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.cacaoPunto.create).not.toHaveBeenCalled();
  });

  it('crea el punto en la empresa de quien lo pide', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findFirst.mockResolvedValue(null);
    await service.create(4, { nombre: 'Norte', direccion: 'Km 5' });
    expect(prisma.cacaoPunto.create).toHaveBeenCalledWith({
      data: { companyId: 4, nombre: 'Norte', direccion: 'Km 5' },
    });
  });

  it('no toca un punto de otra empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findFirst.mockResolvedValue(null);
    await expect(service.update(4, 9, { activo: false })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(4, 9)).rejects.toThrow(NotFoundException);
  });

  it('un punto con recepciones no se borra: se desactiva', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findFirst.mockResolvedValue({ id: 1, nombre: 'Norte' });
    prisma.cacaoReception.count.mockResolvedValue(2);
    await expect(service.remove(4, 1)).rejects.toThrow(/desactívalo/);
    expect(prisma.cacaoPunto.delete).not.toHaveBeenCalled();
  });

  it('un punto sin recepciones sí se borra', async () => {
    const { prisma, service } = armar();
    prisma.cacaoPunto.findFirst.mockResolvedValue({ id: 1, nombre: 'Norte' });
    await service.remove(4, 1);
    expect(prisma.cacaoPunto.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
