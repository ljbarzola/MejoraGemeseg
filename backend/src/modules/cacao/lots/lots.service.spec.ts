import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CacaoLotsService } from './lots.service';

function armar() {
  const prisma = {
    cacaoLot: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    // Pesadas (tandas) de las recepciones del lote; vacío = se pesó de una sola vez.
    cacaoReceptionWeighing: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CacaoLotsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

/** Un lote con 1000 kg recibidos (en dos recepciones del mismo lote no ocurre, pero la suma lo cubre). */
const lote = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: 'LOTE-2026-00007',
  status: 'OPEN',
  netWeight: 1000,
  dryWeight: null,
  differential: null,
  receptions: [{ netWeight: 1000, differential: null }],
  kardex: [],
  priceFixings: [],
  quality: { id: 1 },
  ...over,
});

describe('CacaoLotsService: merma de secado', () => {
  it('sin peso seco no hay merma', async () => {
    const a = armar();
    a.prisma.cacaoLot.findMany.mockResolvedValue([lote()]);
    const [l] = (await a.service.findAll(4, {})) as Array<Record<string, unknown>>;
    expect(l.receivedKg).toBe(1000);
    expect(l.shrinkageKg).toBeNull();
    expect(l.shrinkagePct).toBeNull();
  });

  it('calcula la merma en kg y en % contra lo recibido', async () => {
    const a = armar();
    a.prisma.cacaoLot.findMany.mockResolvedValue([lote({ dryWeight: 950 })]);
    const [l] = (await a.service.findAll(4, {})) as Array<Record<string, unknown>>;
    expect(l.shrinkageKg).toBe(50);
    expect(l.shrinkagePct).toBe(5);
  });

  it('la base es lo recibido, no el peso actual del lote (que baja con los embarques)', async () => {
    const a = armar();
    // Se vendieron 600 kg: el lote tiene 400, pero se recibieron 1000 y se secó a 950.
    a.prisma.cacaoLot.findMany.mockResolvedValue([
      lote({ netWeight: 400, dryWeight: 950 }),
    ]);
    const [l] = (await a.service.findAll(4, {})) as Array<Record<string, unknown>>;
    expect(l.receivedKg).toBe(1000);
    expect(l.shrinkagePct).toBe(5);
  });

  it('redondea el porcentaje a 2 decimales', async () => {
    const a = armar();
    a.prisma.cacaoLot.findMany.mockResolvedValue([
      lote({ receptions: [{ netWeight: 900 }], dryWeight: 850 }),
    ]);
    const [l] = (await a.service.findAll(4, {})) as Array<Record<string, unknown>>;
    expect(l.shrinkagePct).toBe(5.56); // 50 / 900
  });

  it('el detalle del lote también trae la merma', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote({ dryWeight: 900 }));
    const l = (await a.service.findOne(7, 4)) as unknown as Record<string, unknown>;
    expect(l.shrinkagePct).toBe(10);
  });

  it('el detalle del lote trae las pesadas de su recepción, en orden y solo de la empresa', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(
      lote({ receptions: [{ id: 31, netWeight: 1000, differential: null }] }),
    );
    const pesadas = [
      { id: 1, receptionId: 31, lineNo: 1, netWeight: 600 },
      { id: 2, receptionId: 31, lineNo: 2, netWeight: 400 },
    ];
    a.prisma.cacaoReceptionWeighing.findMany.mockResolvedValue(pesadas);
    const l = (await a.service.findOne(7, 4)) as unknown as {
      weighings: unknown[];
    };
    expect(l.weighings).toEqual(pesadas);
    expect(a.prisma.cacaoReceptionWeighing.findMany).toHaveBeenCalledWith({
      where: { companyId: 4, receptionId: { in: [31] } },
      orderBy: [{ receptionId: 'asc' }, { lineNo: 'asc' }],
    });
  });

  it('un lote de una sola pesada trae la lista de pesadas vacía', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote());
    const l = (await a.service.findOne(7, 4)) as unknown as {
      weighings: unknown[];
    };
    expect(l.weighings).toEqual([]);
  });

  it('no muestra un lote de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(null);
    await expect(a.service.findOne(7, 4)).rejects.toThrow(NotFoundException);
  });
});

describe('CacaoLotsService.setDryWeight', () => {
  it('guarda el peso seco y devuelve el lote con su merma', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst
      .mockResolvedValueOnce(lote()) // validación
      .mockResolvedValueOnce(lote({ dryWeight: 950 })); // lote ya actualizado
    const r = (await a.service.setDryWeight(7, 4, 950)) as unknown as {
      shrinkagePct: number;
    };
    expect(a.prisma.cacaoLot.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { dryWeight: 950 },
    });
    expect(r.shrinkagePct).toBe(5);
  });

  it('no puede superar lo recibido: el cacao pierde peso al secarse', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote());
    await expect(a.service.setDryWeight(7, 4, 1200)).rejects.toThrow(
      /no puede superar lo recibido \(1000 kg\)/,
    );
    expect(a.prisma.cacaoLot.update).not.toHaveBeenCalled();
  });

  it('acepta justo lo recibido (merma cero) y una diferencia de redondeo', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote());
    await a.service.setDryWeight(7, 4, 1000);
    await a.service.setDryWeight(7, 4, 1000.0005);
    expect(a.prisma.cacaoLot.update).toHaveBeenCalledTimes(2);
  });

  it('mandar null borra el peso seco', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote({ dryWeight: 950 }));
    await a.service.setDryWeight(7, 4, null);
    expect(a.prisma.cacaoLot.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { dryWeight: null },
    });
  });

  it('un lote anulado no admite peso seco', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(lote({ status: 'VOIDED' }));
    await expect(a.service.setDryWeight(7, 4, 900)).rejects.toThrow(
      BadRequestException,
    );
    expect(a.prisma.cacaoLot.update).not.toHaveBeenCalled();
  });

  it('no toca un lote de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoLot.findFirst.mockResolvedValue(null);
    await expect(a.service.setDryWeight(7, 4, 900)).rejects.toThrow(
      NotFoundException,
    );
    const filtro = a.prisma.cacaoLot.findFirst.mock.calls[0][0] as {
      where: { id: number; companyId: number };
    };
    expect(filtro.where).toEqual({ id: 7, companyId: 4 });
    expect(a.prisma.cacaoLot.update).not.toHaveBeenCalled();
  });
});
