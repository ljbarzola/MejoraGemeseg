import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoUnitConfigService, KG_POR_QUINTAL } from './unit-config.service';

function armar() {
  const prisma = {
    cacaoUnitConfig: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new CacaoUnitConfigService(
    prisma as unknown as PrismaService,
  );
  return { prisma, service };
}

describe('CacaoUnitConfigService.getFactor', () => {
  it('toneladas y kilos son universales', async () => {
    const { service } = armar();
    expect(await service.getFactor('TON', 4)).toBe(1000);
    expect(await service.getFactor('KG', 4)).toBe(1);
  });

  it('el quintal son 100 libras y es universal: no depende de la empresa', async () => {
    const { prisma, service } = armar();
    expect(await service.getFactor('QQ', 4)).toBe(KG_POR_QUINTAL);
    expect(await service.getFactor('QQ', 9)).toBe(45.359237);
    expect(prisma.cacaoUnitConfig.findFirst).not.toHaveBeenCalled();
    // 10 quintales = 453,59237 kg, y de vuelta
    expect(await service.convertToKg(10, 'QQ', 4)).toBeCloseTo(453.59237, 6);
    expect(await service.convertFromKg(453.59237, 'QQ', 4)).toBeCloseTo(10, 6);
  });

  it('el saco lo define cada empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue({ kgPerUnit: 90 });
    expect(await service.getFactor('SACO', 4)).toBe(90);
    expect(prisma.cacaoUnitConfig.findFirst).toHaveBeenCalledWith({
      where: { companyId: 4, isDefault: true },
    });
  });

  it('sin saco configurado no se asume ningún peso: pide configurarlo', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue(null);
    await expect(service.getFactor('SACO', 4)).rejects.toThrow(
      /Falta configurar el peso del saco/,
    );
  });

  it('convierte hacia y desde kilos con el factor de la empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue({ kgPerUnit: 70 });
    expect(await service.convertToKg(10, 'SACO', 4)).toBe(700);
    expect(await service.convertFromKg(700, 'SACO', 4)).toBe(10);
  });
});

describe('CacaoUnitConfigService.create', () => {
  const dto = { name: 'SACO', displayName: 'Saco', kgPerUnit: 70 };

  it('la primera unidad queda como la del saco por defecto', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.count.mockResolvedValue(0);
    await service.create(dto, 4);
    expect(prisma.cacaoUnitConfig.create).toHaveBeenCalledWith({
      data: { ...dto, isDefault: true, companyId: 4 },
    });
  });

  it('una unidad nueva no cambia la por defecto salvo que se pida', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.count.mockResolvedValue(1);
    await service.create(dto, 4);
    expect(prisma.cacaoUnitConfig.updateMany).not.toHaveBeenCalled();
    expect(prisma.cacaoUnitConfig.create).toHaveBeenCalledWith({
      data: { ...dto, isDefault: false, companyId: 4 },
    });
  });

  it('al marcarla por defecto desmarca las demás de la empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.count.mockResolvedValue(2);
    await service.create({ ...dto, isDefault: true }, 4);
    expect(prisma.cacaoUnitConfig.updateMany).toHaveBeenCalledWith({
      where: { companyId: 4 },
      data: { isDefault: false },
    });
  });
});

describe('CacaoUnitConfigService.update y delete', () => {
  it('falla con una unidad de otra empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue(null);
    await expect(service.update(1, { kgPerUnit: 60 }, 4)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.delete(1, 4)).rejects.toThrow(NotFoundException);
  });

  it('no deja quitarle «por defecto» a la unidad por defecto sin elegir otra', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue({
      id: 1,
      isDefault: true,
    });
    await expect(service.update(1, { isDefault: false }, 4)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cambiar la unidad por defecto desmarca la anterior', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue({
      id: 2,
      isDefault: false,
    });
    await service.update(2, { isDefault: true }, 4);
    expect(prisma.cacaoUnitConfig.updateMany).toHaveBeenCalledWith({
      where: { companyId: 4 },
      data: { isDefault: false },
    });
    expect(prisma.cacaoUnitConfig.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { isDefault: true },
    });
  });

  it('no elimina la unidad por defecto', async () => {
    const { prisma, service } = armar();
    prisma.cacaoUnitConfig.findFirst.mockResolvedValue({
      id: 1,
      isDefault: true,
    });
    await expect(service.delete(1, 4)).rejects.toThrow(BadRequestException);
    expect(prisma.cacaoUnitConfig.delete).not.toHaveBeenCalled();
  });
});
