import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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

  async create(data: { name: string; displayName: string; kgPerUnit: number; isDefault?: boolean; companyId: number }) {
    if (data.isDefault) {
      await this.prisma.cacaoUnitConfig.updateMany({
        where: { companyId: data.companyId },
        data: { isDefault: false },
      });
    }
    return this.prisma.cacaoUnitConfig.create({ data });
  }

  async update(id: number, data: { name?: string; displayName?: string; kgPerUnit?: number; isDefault?: boolean }, companyId: number) {
    const config = await this.prisma.cacaoUnitConfig.findFirst({ where: { id, companyId } });
    if (!config) throw new Error('Configuración no encontrada');

    if (data.isDefault) {
      await this.prisma.cacaoUnitConfig.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }
    return this.prisma.cacaoUnitConfig.update({ where: { id }, data });
  }

  async delete(id: number, companyId: number) {
    const config = await this.prisma.cacaoUnitConfig.findFirst({ where: { id, companyId } });
    if (!config) throw new Error('Configuración no encontrada');
    if (config.isDefault) throw new Error('No puede eliminar la unidad por defecto');
    return this.prisma.cacaoUnitConfig.delete({ where: { id } });
  }

  /**
   * Convierte un valor de una unidad a kg
   */
  async convertToKg(value: number, unit: string, companyId: number): Promise<number> {
    switch (unit) {
      case 'TON': return value * 1000;
      case 'KG': return value;
      case 'SACO': {
        const config = await this.findDefault(companyId);
        return value * (config?.kgPerUnit || 69);
      }
      default: return value;
    }
  }

  /**
   * Convierte kg a una unidad de medida
   */
  async convertFromKg(kg: number, unit: string, companyId: number): Promise<number> {
    switch (unit) {
      case 'TON': return kg / 1000;
      case 'KG': return kg;
      case 'SACO': {
        const config = await this.findDefault(companyId);
        return kg / (config?.kgPerUnit || 69);
      }
      default: return kg;
    }
  }

  /**
   * Retorna el factor de conversión para una unidad
   */
  async getFactor(unit: string, companyId: number): Promise<number> {
    switch (unit) {
      case 'TON': return 1000;
      case 'KG': return 1;
      case 'SACO': {
        const config = await this.findDefault(companyId);
        return config?.kgPerUnit || 69;
      }
      default: return 1;
    }
  }
}
