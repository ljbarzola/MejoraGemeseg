import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { CacaoUnitConfigService } from '../unit-config/unit-config.service';

@Injectable()
export class CacaoShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConfig: CacaoUnitConfigService,
  ) {}

  async findAll(companyId: number) {
    return this.prisma.cacaoShipment.findMany({
      where: { companyId },
      include: { client: true, lots: { include: { lot: true } }, receivable: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateShipmentDto, companyId: number, userId: number) {
    const unit = dto.unitOfMeasure || 'KG';

    // Convert total weight to kg for kardex
    const totalWeightKg = await this.unitConfig.convertToKg(dto.totalWeight, unit, companyId);

    // Calculate sale price per kg
    const salePricePerKg = totalWeightKg > 0 ? (dto.totalWeight * dto.salePrice) / totalWeightKg : dto.salePrice;

    const shipment = await this.prisma.cacaoShipment.create({
      data: {
        date: new Date(dto.date),
        clientId: dto.clientId,
        contractRef: dto.contractRef,
        unitOfMeasure: unit,
        totalWeight: dto.totalWeight,
        totalWeightKg,
        totalCost: dto.totalCost,
        salePrice: dto.salePrice,
        salePricePerKg,
        margin: dto.margin,
        status: 'PENDING',
        companyId,
        createdBy: userId,
      },
    });

    if (dto.lots && dto.lots.length > 0) {
      for (const sl of dto.lots) {
        const lot = await this.prisma.cacaoLot.findFirst({ where: { id: sl.lotId, companyId } });
        if (!lot) throw new BadRequestException(`Lote ${sl.lotId} no encontrado`);

        // Convert quantity to kg for validation and kardex
        const quantityKg = await this.unitConfig.convertToKg(sl.quantity, unit, companyId);

        if (lot.netWeight < quantityKg) throw new BadRequestException(`Lote ${lot.code} no tiene suficiente peso`);

        await this.prisma.cacaoShipmentLot.create({
          data: {
            shipmentId: shipment.id,
            lotId: sl.lotId,
            quantity: sl.quantity,
            quantityKg,
            unitCost: sl.unitCost,
            saleAmount: sl.saleAmount,
            unitOfMeasure: unit,
          },
        });

        const newWeight = lot.netWeight - quantityKg;
        await this.prisma.cacaoLot.update({
          where: { id: sl.lotId },
          data: {
            netWeight: newWeight,
            status: newWeight <= 0 ? 'CLOSED' : 'OPEN',
          },
        });

        const lastKardex = await this.prisma.cacaoKardex.findFirst({
          where: { lotId: sl.lotId, companyId },
          orderBy: { id: 'desc' },
        });

        const prevQty = lastKardex?.balanceQty || 0;
        const prevCost = lastKardex?.balanceCost || 0;
        const exitCost = sl.unitCost * quantityKg;

        await this.prisma.cacaoKardex.create({
          data: {
            lotId: sl.lotId,
            type: 'EXIT',
            quantity: quantityKg,
            unitCost: sl.unitCost,
            totalCost: exitCost,
            balanceQty: prevQty - quantityKg,
            balanceCost: prevCost - exitCost,
            date: new Date(dto.date),
            reference: `Embarque ${dto.contractRef}`,
            referenceUnit: dto.unitOfMeasure || 'KG',
            companyId,
          },
        });
      }
    }

    await this.prisma.cacaoReceivable.create({
      data: {
        shipmentId: shipment.id,
        clientId: dto.clientId,
        totalAmount: totalWeightKg * salePricePerKg,
        receivedAmount: 0,
        dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        companyId,
      },
    });

    return this.prisma.cacaoShipment.findUnique({
      where: { id: shipment.id },
      include: { client: true, lots: { include: { lot: true } }, receivable: true },
    });
  }
}
