import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQualityDto, UpdateQualityDto } from './dto/quality.dto';

/**
 * Calidades de cacao de cada empresa. Antes la tabla era compartida (sin empresa): cualquier
 * empresa veía, editaba y borraba las calidades de las demás. Ahora cada una tiene las suyas
 * y empieza sin ninguna.
 */
@Injectable()
export class CacaoQualitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: number) {
    return this.prisma.cacaoQuality.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateQualityDto, companyId: number) {
    await this.assertNombreLibre(dto.name, companyId);
    return this.prisma.cacaoQuality.create({
      data: { ...dto, name: dto.name.trim(), companyId },
    });
  }

  async update(id: number, dto: UpdateQualityDto, companyId: number) {
    await this.findOne(id, companyId);
    if (dto.name !== undefined) {
      await this.assertNombreLibre(dto.name, companyId, id);
    }
    return this.prisma.cacaoQuality.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      },
    });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    const lotes = await this.prisma.cacaoLot.count({
      where: { qualityId: id, companyId },
    });
    if (lotes > 0) {
      throw new BadRequestException(
        'No se puede eliminar: ya hay lotes con esta calidad',
      );
    }
    return this.prisma.cacaoQuality.delete({ where: { id } });
  }

  private async findOne(id: number, companyId: number) {
    const quality = await this.prisma.cacaoQuality.findFirst({
      where: { id, companyId },
    });
    if (!quality) throw new NotFoundException('Calidad no encontrada');
    return quality;
  }

  private async assertNombreLibre(
    name: string,
    companyId: number,
    exceptId?: number,
  ) {
    const existente = await this.prisma.cacaoQuality.findFirst({
      where: {
        companyId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una calidad con ese nombre');
    }
  }
}
