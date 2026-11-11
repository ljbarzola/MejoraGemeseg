import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Una liquidación rechazada o anulada devuelve el anticipo que había descontado; una pendiente,
 * aprobada o pagada lo tiene tomado.
 */
export const ESTADOS_QUE_CONSUMEN_ANTICIPO = ['PENDING', 'APPROVED', 'PAID'];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type ClienteAnticipos = Pick<
  PrismaService,
  'cacaoSupplierAdvance' | 'cacaoSettlement'
>;

/**
 * Saldo de anticipos por proveedor: lo anticipado (sin anulados) menos lo ya descontado en
 * liquidaciones vigentes. No se guarda en ningún lado: así cuando una liquidación se rechaza o se
 * anula, su anticipo vuelve al saldo sin tener que acordarse de devolverlo.
 * Sin `supplierIds` devuelve el de todos los proveedores de la empresa que tengan movimientos.
 */
export async function saldosAnticipos(
  prisma: ClienteAnticipos,
  companyId: number,
  supplierIds?: number[],
): Promise<Map<number, number>> {
  const filtroProveedor =
    supplierIds === undefined ? {} : { supplierId: { in: supplierIds } };
  const [dados, descontados] = await Promise.all([
    prisma.cacaoSupplierAdvance.groupBy({
      by: ['supplierId'],
      where: { companyId, voidedAt: null, ...filtroProveedor },
      _sum: { amount: true },
    }),
    prisma.cacaoSettlement.groupBy({
      by: ['supplierId'],
      where: {
        companyId,
        status: { in: ESTADOS_QUE_CONSUMEN_ANTICIPO },
        ...filtroProveedor,
      },
      _sum: { advanceApplied: true },
    }),
  ]);
  const saldos = new Map<number, number>();
  for (const d of dados) saldos.set(d.supplierId, d._sum.amount ?? 0);
  for (const d of descontados) {
    saldos.set(
      d.supplierId,
      (saldos.get(d.supplierId) ?? 0) - (d._sum.advanceApplied ?? 0),
    );
  }
  for (const [id, saldo] of saldos) saldos.set(id, round2(saldo));
  return saldos;
}

/** Saldo de anticipos de un solo proveedor (0 si no tiene movimientos). */
export async function saldoAnticipos(
  prisma: ClienteAnticipos,
  companyId: number,
  supplierId: number,
): Promise<number> {
  return (
    (await saldosAnticipos(prisma, companyId, [supplierId])).get(supplierId) ??
    0
  );
}
