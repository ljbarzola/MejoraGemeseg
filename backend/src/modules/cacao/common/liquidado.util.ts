import type { PrismaService } from '../../../prisma/prisma.service';

/** Una liquidación rechazada o anulada deja libre el peso que había tomado. */
export const ESTADOS_QUE_LIBERAN_LOTE = ['REJECTED', 'CANCELLED'];

/**
 * Kilos ya liquidados por lote: suma de las liquidaciones vigentes (no rechazadas ni anuladas).
 * Cada recepción forma su propio lote, así que el lote identifica la entrega.
 */
export async function liquidadoPorLote(
  prisma: Pick<PrismaService, 'cacaoSettlementLot'>,
  companyId: number,
  lotIds: number[],
): Promise<Map<number, number>> {
  if (lotIds.length === 0) return new Map<number, number>();
  const liquidado = await prisma.cacaoSettlementLot.groupBy({
    by: ['lotId'],
    where: {
      lotId: { in: lotIds },
      settlement: {
        companyId,
        status: { notIn: ESTADOS_QUE_LIBERAN_LOTE },
      },
    },
    _sum: { quantity: true },
  });
  return new Map(liquidado.map((g) => [g.lotId, g._sum.quantity ?? 0]));
}
