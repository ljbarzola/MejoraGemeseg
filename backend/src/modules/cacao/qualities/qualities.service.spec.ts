import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoQualitiesService } from './qualities.service';

function armar() {
  const prisma = {
    cacaoQuality: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cacaoLot: { count: jest.fn() },
  };
  const service = new CacaoQualitiesService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CacaoQualitiesService', () => {
  it('lista solo las calidades de la empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findMany.mockResolvedValue([]);
    await service.findAll(4);
    expect(prisma.cacaoQuality.findMany).toHaveBeenCalledWith({
      where: { companyId: 4 },
      orderBy: { name: 'asc' },
    });
  });

  it('crea la calidad en la empresa del usuario y con el nombre recortado', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst.mockResolvedValue(null);
    await service.create({ name: '  CCN-51  ', humidityDiscount: 7 }, 4);
    expect(prisma.cacaoQuality.create).toHaveBeenCalledWith({
      data: { name: 'CCN-51', humidityDiscount: 7, companyId: 4 },
    });
  });

  it('no permite repetir el nombre dentro de la empresa, sin importar mayúsculas', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.create({ name: 'ccn-51' }, 4)).rejects.toThrow(
      /Ya existe una calidad/,
    );
    const filtro = prisma.cacaoQuality.findFirst.mock.calls[0][0] as {
      where: { companyId: number; name: { mode: string } };
    };
    expect(filtro.where.companyId).toBe(4);
    expect(filtro.where.name.mode).toBe('insensitive');
    expect(prisma.cacaoQuality.create).not.toHaveBeenCalled();
  });

  it('no edita ni borra una calidad de otra empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst.mockResolvedValue(null);
    await expect(service.update(9, { name: 'X' }, 4)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(9, 4)).rejects.toThrow(NotFoundException);
    expect(prisma.cacaoQuality.update).not.toHaveBeenCalled();
    expect(prisma.cacaoQuality.delete).not.toHaveBeenCalled();
  });

  it('al renombrar, ignora la propia calidad al buscar duplicados', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst
      .mockResolvedValueOnce({ id: 3 }) // la calidad existe y es de la empresa
      .mockResolvedValueOnce(null); // ninguna otra se llama igual
    await service.update(3, { name: 'Nacional' }, 4);
    const filtroDuplicado = prisma.cacaoQuality.findFirst.mock.calls[1][0] as {
      where: { id: { not: number } };
    };
    expect(filtroDuplicado.where.id).toEqual({ not: 3 });
    expect(prisma.cacaoQuality.update).toHaveBeenCalled();
  });

  it('no elimina una calidad que ya tiene lotes', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst.mockResolvedValue({ id: 3 });
    prisma.cacaoLot.count.mockResolvedValue(2);
    await expect(service.remove(3, 4)).rejects.toThrow(BadRequestException);
    expect(prisma.cacaoQuality.delete).not.toHaveBeenCalled();
  });

  it('elimina una calidad sin lotes', async () => {
    const { prisma, service } = armar();
    prisma.cacaoQuality.findFirst.mockResolvedValue({ id: 3 });
    prisma.cacaoLot.count.mockResolvedValue(0);
    await service.remove(3, 4);
    expect(prisma.cacaoQuality.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });
});
