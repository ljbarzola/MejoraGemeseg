import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateUnitConfigDto,
  UpdateUnitConfigDto,
} from './dto/unit-config.dto';

const MSG_SIN_SACO =
  'Falta configurar el peso del saco: ve a Cacao → Configuración → Unidades de medida';

/** Un quintal son 100 libras (la libra pesa exactamente 0,45359237 kg). Es universal, como la tonelada. */
export const KG_POR_QUINTAL = 45.359237;

@Injectable()
export class CacaoUnitConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cacaoUnitConfig.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async findDefault(companyId: number) {
    return this.prisma.cacaoUnitConfig.findFirst({
      where: { companyId, isDefault: true },
    });
  }

  async create(dto: CreateUnitConfigDto, companyId: number) {
    // La primera unidad que se crea queda como la del saco por defecto: sin ella no se
    // puede registrar nada en sacos.
    const existentes = await this.prisma.cacaoUnitConfig.count({
      where: { companyId },
    });
    const isDefault = dto.isDefault === true || existentes === 0;
    if (isDefault) {
      await this.prisma.cacaoUnitConfig.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }
    return this.prisma.cacaoUnitConfig.create({
      data: { ...dto, isDefault, companyId },
    });
  }

  async update(id: number, dto: UpdateUnitConfigDto, companyId: number) {
    const config = await this.prisma.cacaoUnitConfig.findFirst({
      where: { id, companyId },
    });
    if (!config) throw new NotFoundException('Unidad no encontrada');

    if (dto.isDefault === false && config.isDefault) {
      throw new BadRequestException(
        'Para cambiar la unidad por defecto, marca otra como por defecto',
      );
    }
    if (dto.isDefault) {
      await this.prisma.cacaoUnitConfig.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }
    return this.prisma.cacaoUnitConfig.update({ where: { id }, data: dto });
  }

  async delete(id: number, companyId: number) {
    const config = await this.prisma.cacaoUnitConfig.findFirst({
      where: { id, companyId },
    });
    if (!config) throw new NotFoundException('Unidad no encontrada');
    if (config.isDefault) {
      throw new BadRequestException('No puedes eliminar la unidad por defecto');
    }
    return this.prisma.cacaoUnitConfig.delete({ where: { id } });
  }

  /**
   * Kilogramos por unidad de medida. Toneladas, quintales y kilogramos son universales; el
   * saco lo define cada empresa. Si todavía no configuró su saco no se asume ningún peso: se
   * le pide configurarlo (antes se usaba 69 kg sin avisar).
   */
  async getFactor(unit: string, companyId: number): Promise<number> {
    switch (unit) {
      case 'TON':
        return 1000;
      case 'QQ':
        return KG_POR_QUINTAL;
      case 'KG':
        return 1;
      case 'SACO': {
        const config = await this.findDefault(companyId);
        if (!config) throw new BadRequestException(MSG_SIN_SACO);
        return config.kgPerUnit;
      }
      default:
        return 1;
    }
  }

  /** Convierte un valor de una unidad a kg. */
  async convertToKg(
    value: number,
    unit: string,
    companyId: number,
  ): Promise<number> {
    return value * (await this.getFactor(unit, companyId));
  }

  /** Convierte kg a una unidad de medida. */
  async convertFromKg(
    kg: number,
    unit: string,
    companyId: number,
  ): Promise<number> {
    return kg / (await this.getFactor(unit, companyId));
  }
}
