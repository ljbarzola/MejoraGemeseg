import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import { CacheService } from '../../cache/cache.service';

const INTENTOS_CODIGO_DE_LOTE = 5;

/** ¿El error es una violación de unicidad (dos recepciones pidieron el mismo código de lote)? */
function esCodigoDuplicado(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

@Injectable()
export class CacaoReceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConfig: CacaoUnitConfigService,
    private readonly cache: CacheService,
  ) {}

  async findAll(
    companyId: number,
    query: { supplierId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.CacaoReceptionWhereInput = { companyId };
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    return this.prisma.cacaoReception.findMany({
      where,
      include: { supplier: true, lot: true },
      orderBy: { date: 'desc' },
    });
  }

  async findQualities(companyId: number) {
    return this.prisma.cacaoQuality.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Registra una recepción: crea su lote, la recepción y la entrada del kárdex en UNA
   * transacción (antes eran tres escrituras sueltas y una falla dejaba un lote sin
   * recepción). Si dos recepciones piden a la vez el mismo código de lote, la segunda
   * reintenta con el siguiente.
   */
  async create(dto: CreateReceptionDto, companyId: number, userId: number) {
    const unit = dto.unitOfMeasure || 'KG';

    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id: dto.supplierId, companyId },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const quality = await this.prisma.cacaoQuality.findFirst({
      where: { id: dto.qualityId, companyId },
    });
    if (!quality) throw new BadRequestException('Calidad no encontrada');

    // Todo se guarda en kg
    const factor = await this.unitConfig.getFactor(unit, companyId);
    const grossWeightKg = dto.grossWeight * factor;
    const tareKg = dto.tare * factor;
    const netWeightKg = grossWeightKg - tareKg;
    if (netWeightKg <= 0) {
      throw new BadRequestException(
        'El peso neto debe ser mayor a cero: revisa el peso bruto y la tara',
      );
    }

    const provPrice = dto.provisionalPrice ?? 0;
    const fecha = new Date(dto.date);
    const year = new Date().getFullYear();

    for (let intento = 1; ; intento++) {
      try {
        const reception = await this.prisma.$transaction(async (tx) => {
          const lastLot = await tx.cacaoLot.findFirst({
            where: { companyId, code: { startsWith: `LOTE-${year}-` } },
            orderBy: { id: 'desc' },
          });
          const seq = lastLot
            ? parseInt(lastLot.code.split('-')[2], 10) + 1
            : 1;
          const lotCode = `LOTE-${year}-${String(seq).padStart(5, '0')}`;

          const lot = await tx.cacaoLot.create({
            data: {
              code: lotCode,
              qualityId: quality.id,
              netWeight: netWeightKg,
              averageCost: provPrice,
              differential: dto.differential ?? null,
              status: 'OPEN',
              companyId,
            },
          });

          const created = await tx.cacaoReception.create({
            data: {
              date: fecha,
              supplierId: dto.supplierId,
              guideNumber: dto.guideNumber.trim(),
              unitOfMeasure: unit,
              grossWeight: grossWeightKg,
              tare: tareKg,
              netWeight: netWeightKg,
              humidity: dto.humidity,
              impurities: dto.impurities,
              provisionalPrice: provPrice,
              differential: dto.differential ?? null,
              qualityId: quality.id,
              lotId: lot.id,
              companyId,
              createdBy: userId,
            },
            include: { supplier: true, lot: true },
          });

          // El kárdex siempre va en kg
          await tx.cacaoKardex.create({
            data: {
              lotId: lot.id,
              type: 'ENTRY',
              quantity: netWeightKg,
              unitCost: provPrice,
              totalCost: netWeightKg * provPrice,
              balanceQty: netWeightKg,
              balanceCost: netWeightKg * provPrice,
              date: fecha,
              reference: `Recepción ${dto.guideNumber.trim()}`,
              referenceUnit: unit,
              companyId,
            },
          });
          return created;
        });
        await this.invalidateCache(companyId);
        return reception;
      } catch (error) {
        if (esCodigoDuplicado(error) && intento < INTENTOS_CODIGO_DE_LOTE) {
          continue;
        }
        throw error;
      }
    }
  }

  async invalidateCache(companyId: number): Promise<void> {
    await this.cache.invalidate(`dashboard:${companyId}`);
    await this.cache.invalidate(`kardex:${companyId}:*`);
  }
}
