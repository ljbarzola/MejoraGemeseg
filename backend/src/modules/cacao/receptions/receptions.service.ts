import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { CacaoUnitConfigService } from '../unit-config/unit-config.service';

@Injectable()
export class CacaoReceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConfig: CacaoUnitConfigService,
  ) {}

  async findAll(companyId: number, query: { supplierId?: string; from?: string; to?: string }) {
    const where: any = { companyId };
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

  async findQualities() {
    return this.prisma.cacaoQuality.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateReceptionDto, companyId: number, userId: number) {
    const unit = dto.unitOfMeasure || 'KG';

    // Convert all weights to kg for internal storage
    const grossWeightKg = await this.unitConfig.convertToKg(dto.grossWeight, unit, companyId);
    const tareKg = await this.unitConfig.convertToKg(dto.tare || 0, unit, companyId);
    const netWeightKg = grossWeightKg - tareKg;

    const now = new Date();
    const year = now.getFullYear();

    const lastLot = await this.prisma.cacaoLot.findFirst({
      where: { companyId, code: { startsWith: `LOTE-${year}-` } },
      orderBy: { id: 'desc' },
    });
    const seq = lastLot ? parseInt(lastLot.code.split('-')[2]) + 1 : 1;
    const lotCode = `LOTE-${year}-${String(seq).padStart(3, '0')}`;

    const qualityId = dto.qualityId || 1;
    const provPrice = dto.provisionalPrice || 0;

    const lot = await this.prisma.cacaoLot.create({
      data: {
        code: lotCode,
        qualityId,
        netWeight: netWeightKg,
        averageCost: provPrice,
        differential: dto.differential || null,
        status: 'OPEN',
        companyId,
      },
    });

    const reception = await this.prisma.cacaoReception.create({
      data: {
        date: new Date(dto.date),
        supplierId: dto.supplierId,
        guideNumber: dto.guideNumber,
        unitOfMeasure: unit,
        grossWeight: grossWeightKg,
        tare: tareKg,
        netWeight: netWeightKg,
        humidity: dto.humidity,
        impurities: dto.impurities,
        provisionalPrice: provPrice,
        differential: dto.differential || null,
        lotId: lot.id,
        companyId,
        createdBy: userId,
      },
      include: { supplier: true, lot: true },
    });

    // Kardex always in kg
    await this.prisma.cacaoKardex.create({
      data: {
        lotId: lot.id,
        type: 'ENTRY',
        quantity: netWeightKg,
        unitCost: provPrice,
        totalCost: netWeightKg * provPrice,
        balanceQty: netWeightKg,
        balanceCost: netWeightKg * provPrice,
        date: new Date(dto.date),
        reference: `Recepción ${dto.guideNumber}`,
        referenceUnit: dto.unitOfMeasure || 'KG',
        companyId,
      },
    });

    return reception;
  }
}
