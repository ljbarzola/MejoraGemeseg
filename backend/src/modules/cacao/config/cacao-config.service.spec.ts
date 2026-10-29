import type { PrismaService } from '../../../prisma/prisma.service';
import { AJUSTES_INICIALES, CacaoConfigService } from './cacao-config.service';

function armar() {
  const prisma = {
    cacaoSetting: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new CacaoConfigService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CacaoConfigService', () => {
  it('una empresa sin ajustes arranca con los valores iniciales', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([]);
    expect(await service.get(4)).toEqual({
      ...AJUSTES_INICIALES,
      precioIce: null,
      pagosRequierenAutorizacion: false,
    });
    expect(prisma.cacaoSetting.findMany).toHaveBeenCalledWith({
      where: { companyId: 4 },
    });
  });

  it('usa lo que la empresa guardó', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([
      { key: 'plazoPagoDias', value: '15' },
      { key: 'plazoCobroDias', value: '90' },
    ]);
    expect(await service.plazoPago(4)).toBe(15);
    expect(await service.plazoCobro(4)).toBe(90);
  });

  it('ignora claves desconocidas y valores que no son enteros válidos', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([
      { key: 'otraCosa', value: '5' },
      { key: 'plazoPagoDias', value: 'abc' },
      { key: 'plazoCobroDias', value: '-3' },
    ]);
    expect(await service.get(4)).toEqual({
      ...AJUSTES_INICIALES,
      precioIce: null,
      pagosRequierenAutorizacion: false,
    });
  });

  it('guarda solo lo que se manda y por empresa', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([]);
    await service.update(4, { plazoPagoDias: 45 });
    expect(prisma.cacaoSetting.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.cacaoSetting.upsert).toHaveBeenCalledWith({
      where: { companyId_key: { companyId: 4, key: 'plazoPagoDias' } },
      update: { value: '45' },
      create: { companyId: 4, key: 'plazoPagoDias', value: '45' },
    });
  });

  it('permite poner un plazo en cero (pago de contado)', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([]);
    await service.update(4, { plazoCobroDias: 0 });
    expect(prisma.cacaoSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '0' } }),
    );
  });

  describe('autorización de pagos', () => {
    it('una empresa nueva paga directo (no exige autorización)', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([]);
      expect(await service.pagosRequierenAutorizacion(4)).toBe(false);
    });

    it('lee lo que la empresa activó y lo guarda como 1 o 0', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([
        { key: 'pagosRequierenAutorizacion', value: '1' },
      ]);
      expect(await service.pagosRequierenAutorizacion(4)).toBe(true);

      await service.update(4, { pagosRequierenAutorizacion: false });
      expect(prisma.cacaoSetting.upsert).toHaveBeenCalledWith({
        where: {
          companyId_key: { companyId: 4, key: 'pagosRequierenAutorizacion' },
        },
        update: { value: '0' },
        create: { companyId: 4, key: 'pagosRequierenAutorizacion', value: '0' },
      });
    });
  });

  describe('precio ICE', () => {
    it('una empresa nueva no tiene precio ICE (no hay valor de fábrica)', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([]);
      expect((await service.get(4)).precioIce).toBeNull();
    });

    it('devuelve el precio que la empresa guardó e ignora uno inválido', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([
        { key: 'precioIce', value: '8150.5' },
      ]);
      expect((await service.get(4)).precioIce).toBe(8150.5);
      prisma.cacaoSetting.findMany.mockResolvedValue([
        { key: 'precioIce', value: 'abc' },
      ]);
      expect((await service.get(4)).precioIce).toBeNull();
      prisma.cacaoSetting.findMany.mockResolvedValue([
        { key: 'precioIce', value: '0' },
      ]);
      expect((await service.get(4)).precioIce).toBeNull();
    });

    it('lo guarda por empresa', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([]);
      await service.update(4, { precioIce: 8200.25 });
      expect(prisma.cacaoSetting.upsert).toHaveBeenCalledWith({
        where: { companyId_key: { companyId: 4, key: 'precioIce' } },
        update: { value: '8200.25' },
        create: { companyId: 4, key: 'precioIce', value: '8200.25' },
      });
    });

    it('mandar null lo borra y no toca los plazos', async () => {
      const { prisma, service } = armar();
      prisma.cacaoSetting.findMany.mockResolvedValue([]);
      await service.update(4, { precioIce: null });
      expect(prisma.cacaoSetting.deleteMany).toHaveBeenCalledWith({
        where: { companyId: 4, key: 'precioIce' },
      });
      expect(prisma.cacaoSetting.upsert).not.toHaveBeenCalled();
    });
  });
});
