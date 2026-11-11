import type { PrismaService } from '../../../prisma/prisma.service';
import {
  ESTADOS_QUE_CONSUMEN_ANTICIPO,
  saldoAnticipos,
  saldosAnticipos,
} from './anticipos.util';

type Dado = { supplierId: number; _sum: { amount: number | null } };
type Descontado = {
  supplierId: number;
  _sum: { advanceApplied: number | null };
};

function armar(dados: Dado[] = [], descontados: Descontado[] = []) {
  const prisma = {
    cacaoSupplierAdvance: { groupBy: jest.fn().mockResolvedValue(dados) },
    cacaoSettlement: { groupBy: jest.fn().mockResolvedValue(descontados) },
  };
  return { prisma, cliente: prisma as unknown as PrismaService };
}

describe('saldosAnticipos', () => {
  it('el saldo es lo anticipado menos lo ya descontado en liquidaciones', async () => {
    const { cliente } = armar(
      [{ supplierId: 1, _sum: { amount: 500 } }],
      [{ supplierId: 1, _sum: { advanceApplied: 120.5 } }],
    );
    const saldos = await saldosAnticipos(cliente, 4);
    expect(saldos.get(1)).toBe(379.5);
  });

  it('un proveedor sin anticipos no aparece, y uno sin descuentos conserva todo', async () => {
    const { cliente } = armar([
      { supplierId: 1, _sum: { amount: 200 } },
      { supplierId: 2, _sum: { amount: 50 } },
    ]);
    const saldos = await saldosAnticipos(cliente, 4);
    expect(saldos.get(1)).toBe(200);
    expect(saldos.get(2)).toBe(50);
    expect(saldos.has(3)).toBe(false);
  });

  it('solo cuenta anticipos no anulados y liquidaciones vigentes, de la empresa', async () => {
    const { prisma, cliente } = armar();
    await saldosAnticipos(cliente, 4);
    const filtroAnticipos = prisma.cacaoSupplierAdvance.groupBy.mock
      .calls[0][0] as { where: Record<string, unknown> };
    expect(filtroAnticipos.where).toEqual({ companyId: 4, voidedAt: null });
    const filtroLiquidaciones = prisma.cacaoSettlement.groupBy.mock
      .calls[0][0] as { where: Record<string, unknown> };
    expect(filtroLiquidaciones.where).toEqual({
      companyId: 4,
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    });
  });

  it('una liquidación rechazada o anulada no consume anticipo', () => {
    expect(ESTADOS_QUE_CONSUMEN_ANTICIPO).not.toContain('REJECTED');
    expect(ESTADOS_QUE_CONSUMEN_ANTICIPO).not.toContain('CANCELLED');
  });

  it('con una lista de proveedores filtra solo por ellos', async () => {
    const { prisma, cliente } = armar();
    await saldosAnticipos(cliente, 4, [7, 8]);
    const filtro = prisma.cacaoSupplierAdvance.groupBy.mock.calls[0][0] as {
      where: { supplierId: unknown };
    };
    expect(filtro.where.supplierId).toEqual({ in: [7, 8] });
    const filtro2 = prisma.cacaoSettlement.groupBy.mock.calls[0][0] as {
      where: { supplierId: unknown };
    };
    expect(filtro2.where.supplierId).toEqual({ in: [7, 8] });
  });

  it('redondea a 2 decimales (sin el ruido de los decimales binarios)', async () => {
    const { cliente } = armar(
      [{ supplierId: 1, _sum: { amount: 0.3 } }],
      [{ supplierId: 1, _sum: { advanceApplied: 0.1 } }],
    );
    expect((await saldosAnticipos(cliente, 4)).get(1)).toBe(0.2);
  });

  it('puede quedar negativo si se descontó más de lo anticipado (dato inconsistente que se ve)', async () => {
    const { cliente } = armar(
      [{ supplierId: 1, _sum: { amount: 100 } }],
      [{ supplierId: 1, _sum: { advanceApplied: 130 } }],
    );
    expect((await saldosAnticipos(cliente, 4)).get(1)).toBe(-30);
  });
});

describe('saldoAnticipos', () => {
  it('devuelve el saldo de un proveedor y 0 si no tiene movimientos', async () => {
    const a = armar([{ supplierId: 1, _sum: { amount: 80 } }]);
    expect(await saldoAnticipos(a.cliente, 4, 1)).toBe(80);
    const b = armar();
    expect(await saldoAnticipos(b.cliente, 4, 1)).toBe(0);
  });
});
