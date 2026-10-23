import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

/** Una liquidación rechazada o anulada deja libre el peso que había tomado del lote. */
const ESTADOS_QUE_LIBERAN_LOTE = ['REJECTED', 'CANCELLED'];
const TOLERANCIA_KG = 0.001;
const DIA_MS = 24 * 60 * 60 * 1000;
const PLAZO_POR_DEFECTO_DIAS = 30;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Desglose de un lote: mismo cálculo que hacía la pantalla, ahora hecho por el servidor
 * para que el monto de la deuda no dependa de lo que mande el navegador.
 */
export function calcularLoteLiquidacion(
  quantityKg: number,
  humidityPct: number,
  impurityPct: number,
  qualityPunishment: number,
  averageCost: number,
) {
  const humidityKg = round4(quantityKg * (humidityPct / 100));
  const impurityKg = round4(quantityKg * (impurityPct / 100));
  const discountKg = round4(humidityKg + impurityKg);
  const netKg = round4(quantityKg - discountKg);
  const effectiveCost = Math.max(0, averageCost - qualityPunishment);
  const amount = round2(netKg * effectiveCost);
  return { discountKg, netKg, effectiveCost, amount };
}

@Injectable()
export class CacaoSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNextId(companyId: number) {
    const last = await this.prisma.cacaoSettlement.findFirst({
      where: { companyId },
      orderBy: { id: 'desc' },
    });
    const nextNum = last ? last.id + 1 : 1;
    return { code: `LIQ-${String(nextNum).padStart(4, '0')}` };
  }

  async findAll(companyId: number) {
    return this.prisma.cacaoSettlement.findMany({
      where: { companyId },
      include: {
        supplier: true,
        lots: {
          include: {
            lot: {
              include: {
                quality: true,
                receptions: {
                  orderBy: { date: 'desc' },
                  take: 1,
                  include: { supplier: true },
                },
              },
            },
          },
        },
        payable: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const settlement = await this.prisma.cacaoSettlement.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        lots: { include: { lot: { include: { quality: true } } } },
        payable: true,
      },
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    return settlement;
  }

  /**
   * Lotes que un proveedor tiene pendientes de liquidar: lo recibido de él en cada lote
   * menos lo que ya está en liquidaciones vigentes. `netWeight` del lote no sirve para
   * esto: baja cuando el lote se vende en un embarque, pero al proveedor se le sigue
   * debiendo todo lo que entregó.
   */
  async getAvailableLots(supplierId: number, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id: supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const lots = await this.prisma.cacaoLot.findMany({
      where: { companyId, receptions: { some: { supplierId } } },
      include: {
        quality: true,
        receptions: { where: { supplierId }, orderBy: { date: 'asc' } },
      },
      orderBy: { id: 'desc' },
    });

    const settled = await this.prisma.cacaoSettlementLot.groupBy({
      by: ['lotId'],
      where: {
        lotId: { in: lots.map((l) => l.id) },
        settlement: {
          supplierId,
          companyId,
          status: { notIn: ESTADOS_QUE_LIBERAN_LOTE },
        },
      },
      _sum: { quantity: true },
    });
    const settledByLot = new Map(
      settled.map((s) => [s.lotId, s._sum.quantity ?? 0]),
    );

    return lots.map((lot) => {
      const receivedKg = lot.receptions.reduce(
        (sum, r) => sum + r.netWeight,
        0,
      );
      const settledKg = settledByLot.get(lot.id) ?? 0;
      return {
        id: lot.id,
        code: lot.code,
        status: lot.status,
        averageCost: lot.averageCost,
        quality: lot.quality,
        receivedKg,
        settledKg,
        availableKg: Math.max(0, round4(receivedKg - settledKg)),
        firstReceptionDate: lot.receptions[0]?.date ?? null,
        unitOfMeasure: lot.receptions[0]?.unitOfMeasure ?? 'KG',
      };
    });
  }

  async create(dto: CreateSettlementDto, companyId: number, userId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id: dto.supplierId, companyId },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodStart > periodEnd) {
      throw new BadRequestException(
        'La fecha de inicio del periodo no puede ser posterior a la fecha fin',
      );
    }

    const lotIds = dto.lots.map((l) => l.lotId);
    if (new Set(lotIds).size !== lotIds.length) {
      throw new BadRequestException(
        'No puede seleccionar el mismo lote dos veces',
      );
    }

    // Todo en una sola transacción: o se guarda la liquidación completa o no se guarda
    // nada (antes podía quedar una liquidación sin lotes o sin deuda a medias).
    return this.prisma.$transaction(async (tx) => {
      // Bloquea los lotes mientras se liquida, para que dos liquidaciones simultáneas no
      // tomen el mismo peso.
      await tx.$queryRaw`SELECT "id" FROM "CacaoLot" WHERE "id" IN (${Prisma.join(lotIds)}) FOR UPDATE`;

      const lots = await tx.cacaoLot.findMany({
        where: { id: { in: lotIds }, companyId },
        include: {
          quality: true,
          receptions: { where: { supplierId: dto.supplierId } },
        },
      });
      const settled = await tx.cacaoSettlementLot.groupBy({
        by: ['lotId'],
        where: {
          lotId: { in: lotIds },
          settlement: {
            supplierId: dto.supplierId,
            companyId,
            status: { notIn: ESTADOS_QUE_LIBERAN_LOTE },
          },
        },
        _sum: { quantity: true },
      });
      const settledByLot = new Map(
        settled.map((s) => [s.lotId, s._sum.quantity ?? 0]),
      );

      const lines = dto.lots.map((input) => {
        const lot = lots.find((l) => l.id === input.lotId);
        if (!lot) {
          throw new BadRequestException(`Lote ${input.lotId} no encontrado`);
        }
        const receivedKg = lot.receptions.reduce((s, r) => s + r.netWeight, 0);
        if (receivedKg <= 0) {
          throw new BadRequestException(
            `El lote ${lot.code} no tiene recepciones de este proveedor`,
          );
        }
        const availableKg = receivedKg - (settledByLot.get(lot.id) ?? 0);
        if (input.quantity > availableKg + TOLERANCIA_KG) {
          throw new BadRequestException(
            `El lote ${lot.code} tiene ${Math.max(0, round4(availableKg))} kg pendientes de liquidar, no puede liquidar ${input.quantity} kg`,
          );
        }

        const humidityPct = input.humidityPct ?? lot.quality.humidityDiscount;
        const impurityPct = input.impurityPct ?? lot.quality.impurityDiscount;
        if (humidityPct + impurityPct >= 100) {
          throw new BadRequestException(
            `Los descuentos del lote ${lot.code} no pueden sumar 100% o más`,
          );
        }
        const qualityPunishment = input.qualityPunishment ?? 0;
        const calc = calcularLoteLiquidacion(
          input.quantity,
          humidityPct,
          impurityPct,
          qualityPunishment,
          lot.averageCost,
        );
        return {
          lotId: lot.id,
          quantity: input.quantity,
          unitCost: lot.averageCost,
          humidityPct,
          impurityPct,
          qualityPunishment,
          netKg: calc.netKg,
          amount: calc.amount,
          discountKg: calc.discountKg,
        };
      });

      const totalNetWeight = round4(lines.reduce((s, l) => s + l.netKg, 0));
      const totalDeductions = round4(
        lines.reduce((s, l) => s + l.discountKg, 0),
      );
      const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
      const finalPrice =
        totalNetWeight > 0 ? round4(totalAmount / totalNetWeight) : 0;

      return tx.cacaoSettlement.create({
        data: {
          date: new Date(dto.date),
          supplierId: dto.supplierId,
          periodStart,
          periodEnd,
          totalNetWeight,
          totalDeductions,
          finalPrice,
          totalAmount,
          dueDays: dto.dueDays ?? null,
          status: 'PENDING',
          companyId,
          createdBy: userId,
          lots: {
            create: lines.map((l) => ({
              lotId: l.lotId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              humidityPct: l.humidityPct,
              impurityPct: l.impurityPct,
              qualityPunishment: l.qualityPunishment,
              netKg: l.netKg,
              amount: l.amount,
            })),
          },
        },
        include: {
          supplier: true,
          lots: { include: { lot: true } },
          payable: true,
        },
      });
    });
  }

  /**
   * Aprueba una liquidación pendiente y recién ahí nace la cuenta por pagar. Solo la
   * puede aprobar alguien distinto de quien la creó (la ruta limita el rol).
   */
  async approve(id: number, companyId: number, userId: number) {
    const settlement = await this.findOne(id, companyId);
    if (settlement.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se puede aprobar una liquidación pendiente de aprobación',
      );
    }
    if (settlement.createdBy === userId) {
      throw new ForbiddenException(
        'La liquidación debe aprobarla otra persona, no quien la creó',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cacaoSettlement.updateMany({
        where: { id, companyId, status: 'PENDING' },
        data: { status: 'APPROVED', decidedBy: userId, decidedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new BadRequestException(
          'La liquidación ya fue decidida por otra persona',
        );
      }
      const existing = await tx.cacaoPayable.findUnique({
        where: { settlementId: id },
      });
      if (!existing) {
        const days = settlement.dueDays ?? PLAZO_POR_DEFECTO_DIAS;
        await tx.cacaoPayable.create({
          data: {
            settlementId: id,
            supplierId: settlement.supplierId,
            totalAmount: settlement.totalAmount,
            paidAmount: 0,
            dueDate: new Date(Date.now() + days * DIA_MS),
            status: 'PENDING',
            companyId,
          },
        });
      }
    });
    return this.findOne(id, companyId);
  }

  async reject(id: number, companyId: number, userId: number, reason: string) {
    const settlement = await this.findOne(id, companyId);
    if (settlement.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se puede rechazar una liquidación pendiente de aprobación',
      );
    }
    const updated = await this.prisma.cacaoSettlement.updateMany({
      where: { id, companyId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        decidedBy: userId,
        decidedAt: new Date(),
        decisionReason: reason.trim(),
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException(
        'La liquidación ya fue decidida por otra persona',
      );
    }
    return this.findOne(id, companyId);
  }

  /**
   * Anula una liquidación aprobada que todavía no tiene pagos. Si ya se pagó algo, primero
   * hay que anular esos pagos.
   */
  async cancel(id: number, companyId: number, userId: number, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      // Mismo bloqueo que usa el pago: no se puede anular mientras alguien está pagando.
      await tx.$queryRaw`SELECT "id" FROM "CacaoPayable" WHERE "settlementId" = ${id} FOR UPDATE`;

      const settlement = await tx.cacaoSettlement.findFirst({
        where: { id, companyId },
        include: { payable: true },
      });
      if (!settlement) throw new NotFoundException('Liquidación no encontrada');
      if (settlement.status !== 'APPROVED') {
        throw new BadRequestException(
          'Solo se puede anular una liquidación aprobada. Si está pendiente, recházala; si ya está pagada, anula antes sus pagos',
        );
      }
      const activePayments = settlement.payable
        ? await tx.cacaoPayment.count({
            where: { payableId: settlement.payable.id, voidedAt: null },
          })
        : 0;
      if (activePayments > 0 || (settlement.payable?.paidAmount ?? 0) > 0) {
        throw new BadRequestException(
          'La liquidación tiene pagos registrados: anúlalos antes de anularla',
        );
      }

      await tx.cacaoSettlement.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          decidedBy: userId,
          decidedAt: new Date(),
          decisionReason: reason.trim(),
        },
      });
      if (settlement.payable) {
        await tx.cacaoPayable.update({
          where: { id: settlement.payable.id },
          data: { status: 'CANCELLED' },
        });
      }
    });
    return this.findOne(id, companyId);
  }
}
