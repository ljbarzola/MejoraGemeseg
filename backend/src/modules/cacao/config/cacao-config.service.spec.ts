import type { PrismaService } from '../../../prisma/prisma.service';
import { AJUSTES_INICIALES, CacaoConfigService } from './cacao-config.service';

function armar() {
  const prisma = {
    cacaoSetting: { findMany: jest.fn(), upsert: jest.fn() },
  };
  const service = new CacaoConfigService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CacaoConfigService', () => {
  it('una empresa sin ajustes arranca con los valores iniciales', async () => {
    const { prisma, service } = armar();
    prisma.cacaoSetting.findMany.mockResolvedValue([]);
    expect(await service.get(4)).toEqual(AJUSTES_INICIALES);
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
    expect(await service.get(4)).toEqual(AJUSTES_INICIALES);
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
});
