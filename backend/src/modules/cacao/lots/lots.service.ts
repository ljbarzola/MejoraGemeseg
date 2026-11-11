import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const TOLERANCIA_KG = 0.001;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Lo recibido de un lote (suma de sus recepciones) y, si ya se midió su peso seco, la merma de
 * secado: cuánto del peso recibido se perdió, en kg y en %. El peso del lote (`netWeight`) no sirve
 * de base porque baja cuando se vende en un embarque.
 */
function conMerma<T extends { dryWeight: number | null; receptions: { netWeight: number }[] }>(
  lot: T,
) {
  const receivedKg = round4(lot.receptions.reduce((s, r) => s + r.netWeight, 0));
  const shrinkageKg =
    lot.dryWeight != null ? round4(receivedKg - lot.dryWeight) : null;
  const shrinkagePct =
    shrinkageKg != null && receivedKg > 0
      ? round2((shrinkageKg / receivedKg) * 100)
      : null;
  return { ...lot, receivedKg, shrinkageKg, shrinkagePct };
}

@Injectable()
export class CacaoLotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: number,
    query: { status?: string; qualityId?: string; supplierId?: string },
  ) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.qualityId) where.qualityId = Number(query.qualityId);
    if (query.supplierId) {
      where.receptions = { some: { supplierId: Number(query.supplierId) } };
    }
    const lots = await this.prisma.cacaoLot.findMany({
      where,
      include: { quality: true, receptions: { include: { supplier: true } } },
      orderBy: { id: 'desc' },
    });
    return lots.map(conMerma);
  }

  async getNextCode(companyId: number) {
    const year = new Date().getFullYear();
    const lastLot = await this.prisma.cacaoLot.findFirst({
      where: { companyId, code: { startsWith: `LOTE-${year}-` } },
      orderBy: { id: 'desc' },
    });
    const seq = lastLot ? parseInt(lastLot.code.split('-')[2]) + 1 : 1;
    return { code: `LOTE-${year}-${String(seq).padStart(5, '0')}` };
  }

  async findOne(id: number, companyId: number) {
    const lot = await this.prisma.cacaoLot.findFirst({
      where: { id, companyId },
      include: {
        quality: true,
        receptions: { include: { supplier: true }, orderBy: { date: 'asc' } },
        kardex: { orderBy: { date: 'asc' } },
        priceFixings: true,
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    // Detalle de las pesadas de su recepción (vacío si se pesó de una sola vez).
    const weighings = await this.prisma.cacaoReceptionWeighing.findMany({
      where: { companyId, receptionId: { in: lot.receptions.map((r) => r.id) } },
      orderBy: [{ receptionId: 'asc' }, { lineNo: 'asc' }],
    });
    return {
      ...conMerma(lot),
      differential: lot.differential ?? lot.receptions[0]?.differential ?? null,
      weighings,
    };
  }

  /**
   * Guarda el peso del lote después de secar (o lo borra con `null`). No puede superar lo recibido:
   * el cacao pierde peso al secarse, no lo gana. No toca el kárdex ni lo que se le paga al proveedor.
   */
  async setDryWeight(
    id: number,
    companyId: number,
    dryWeight: number | null,
  ) {
    const lot = await this.prisma.cacaoLot.findFirst({
      where: { id, companyId },
      include: { receptions: { select: { netWeight: true } } },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    if (lot.status === 'VOIDED') {
      throw new BadRequestException(
        'El lote está anulado: no se le puede registrar peso seco',
      );
    }
    if (dryWeight !== null) {
      const recibido = round4(
        lot.receptions.reduce((s, r) => s + r.netWeight, 0),
      );
      if (dryWeight > recibido + TOLERANCIA_KG) {
        throw new BadRequestException(
          `El peso seco (${dryWeight} kg) no puede superar lo recibido (${recibido} kg): al secarse el cacao pierde peso`,
        );
      }
    }
    await this.prisma.cacaoLot.update({
      where: { id },
      data: { dryWeight },
    });
    return this.findOne(id, companyId);
  }
}
