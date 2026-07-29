import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

@Injectable()
export class CacaoSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

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
                receptions: { orderBy: { date: 'desc' }, take: 1, include: { supplier: true } },
              },
            },
          },
        },
        payable: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateSettlementDto, companyId: number, userId: number) {
    const settlement = await this.prisma.cacaoSettlement.create({
      data: {
        date: new Date(dto.date),
        supplierId: dto.supplierId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        totalNetWeight: dto.totalNetWeight,
        totalDeductions: dto.totalDeductions,
        finalPrice: dto.finalPrice,
        totalAmount: dto.totalAmount,
        status: 'PENDING',
        companyId,
        createdBy: userId,
      },
    });

    if (dto.lots && dto.lots.length > 0) {
      await this.prisma.cacaoSettlementLot.createMany({
        data: dto.lots.map((l) => ({
          settlementId: settlement.id,
          lotId: l.lotId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
    }

    await this.prisma.cacaoPayable.create({
      data: {
        settlementId: settlement.id,
        supplierId: dto.supplierId,
        totalAmount: dto.totalAmount,
        paidAmount: 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        companyId,
      },
    });

    return this.prisma.cacaoSettlement.findUnique({
      where: { id: settlement.id },
      include: { supplier: true, lots: { include: { lot: true } }, payable: true },
    });
  }
}
