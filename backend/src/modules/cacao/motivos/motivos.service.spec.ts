import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoMotivosService } from './motivos.service';

function armar() {
  const prisma = {
    cacaoMotivo: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new CacaoMotivosService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CacaoMotivosService', () => {
  it('lista solo los activos de la empresa, por tipo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findMany.mockResolvedValue([]);
    await service.list(4, 'LIQUIDACION');
    expect(prisma.cacaoMotivo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 4, tipo: 'LIQUIDACION', activo: true },
      }),
    );
  });

  it('Configuración puede pedir también los desactivados', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findMany.mockResolvedValue([]);
    await service.list(4, undefined, false);
    expect(prisma.cacaoMotivo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 4 } }),
    );
  });

  it('rechaza un tipo desconocido', async () => {
    const { service } = armar();
    await expect(service.list(4, 'OTRO')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('crea un motivo para la empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst.mockResolvedValue(null);
    prisma.cacaoMotivo.create.mockResolvedValue({ id: 1 });
    await service.create(4, { tipo: 'PAGO', nombre: 'Error de monto' });
    expect(prisma.cacaoMotivo.create).toHaveBeenCalledWith({
      data: { companyId: 4, tipo: 'PAGO', nombre: 'Error de monto' },
    });
  });

  it('no deja repetir el nombre dentro del mismo tipo (sin importar mayúsculas)', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst.mockResolvedValue({ id: 9 });
    await expect(
      service.create(4, { tipo: 'PAGO', nombre: 'error de monto' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cacaoMotivo.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 4,
        tipo: 'PAGO',
        nombre: { equals: 'error de monto', mode: 'insensitive' },
      },
    });
    expect(prisma.cacaoMotivo.create).not.toHaveBeenCalled();
  });

  it('no toca un motivo de otra empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst.mockResolvedValue(null);
    await expect(
      service.update(4, 7, { activo: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(4, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cacaoMotivo.update).not.toHaveBeenCalled();
    expect(prisma.cacaoMotivo.delete).not.toHaveBeenCalled();
    expect(prisma.cacaoMotivo.findFirst).toHaveBeenCalledWith({
      where: { id: 7, companyId: 4 },
    });
  });

  it('desactiva un motivo sin revisar el nombre', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst.mockResolvedValue({
      id: 7,
      tipo: 'PAGO',
      nombre: 'Duplicado',
    });
    prisma.cacaoMotivo.update.mockResolvedValue({});
    await service.update(4, 7, { activo: false });
    expect(prisma.cacaoMotivo.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { activo: false },
    });
  });

  it('al renombrar, el nombre nuevo tampoco puede repetirse en su tipo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst
      .mockResolvedValueOnce({ id: 7, tipo: 'PAGO', nombre: 'Duplicado' })
      .mockResolvedValueOnce({ id: 8 });
    await expect(
      service.update(4, 7, { nombre: 'Error de monto' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cacaoMotivo.findFirst).toHaveBeenLastCalledWith({
      where: {
        companyId: 4,
        tipo: 'PAGO',
        nombre: { equals: 'Error de monto', mode: 'insensitive' },
        id: { not: 7 },
      },
    });
  });

  it('elimina un motivo propio', async () => {
    const { prisma, service } = armar();
    prisma.cacaoMotivo.findFirst.mockResolvedValue({ id: 7 });
    await service.remove(4, 7);
    expect(prisma.cacaoMotivo.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
  });
});
