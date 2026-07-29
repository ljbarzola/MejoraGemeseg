import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePriceFixingDto } from './dto/create-price-fixing.dto';
import { UpdatePriceFixingDto } from './dto/update-price-fixing.dto';

@Injectable()
export class CacaoPriceFixingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cacaoPriceFixing.findMany({
      where: { companyId },
      include: { lot: true },
      orderBy: { id: 'desc' },
    });
  }

  async create(dto: CreatePriceFixingDto, companyId: number, userId: number) {
    const lot = await this.prisma.cacaoLot.findFirst({ where: { id: dto.lotId, companyId } });
    if (!lot) throw new NotFoundException('Lote no encontrado');

    // Use differential from lot if not provided in DTO
    const differential = dto.differential ?? lot.differential ?? 0;

    return this.prisma.cacaoPriceFixing.create({
      data: {
        lotId: dto.lotId,
        referencePrice: dto.referencePrice,
        differential,
        fixedPrice: dto.fixedPrice,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        status: 'OPEN',
        pendingWeight: lot.netWeight,
        companyId,
        createdBy: userId,
      },
      include: { lot: true },
    });
  }

  async update(id: number, dto: UpdatePriceFixingDto, companyId: number) {
    const fixing = await this.prisma.cacaoPriceFixing.findFirst({ where: { id, companyId } });
    if (!fixing) throw new NotFoundException('Fijación no encontrada');

    const updateData: any = {};
    if (dto.referencePrice !== undefined) updateData.referencePrice = dto.referencePrice;
    if (dto.differential !== undefined) updateData.differential = dto.differential;
    if (dto.fixedPrice !== undefined) {
      updateData.fixedPrice = dto.fixedPrice;
      updateData.status = 'FIXED';
      updateData.fixedDate = new Date();
    }
    if (dto.pendingWeight !== undefined) updateData.pendingWeight = dto.pendingWeight;
    if (dto.deadline !== undefined) updateData.deadline = dto.deadline ? new Date(dto.deadline) : null;

    return this.prisma.cacaoPriceFixing.update({
      where: { id },
      data: updateData,
      include: { lot: true },
    });
  }
}
