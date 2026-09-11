import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreatePersonalFieldDefinitionDto,
  UpdatePersonalFieldDefinitionDto,
} from '../dto/personal-field-definition.dto';

// Campos personalizados de la Ficha Personal, creables desde la UI por
// cualquier usuario con acceso al módulo (sin requerir un cambio de código).
@Injectable()
export class PersonalFieldDefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: number, scope: string = 'GUARDIA') {
    return this.prisma.personalFieldDefinition.findMany({
      where: { companyId, scope },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  async create(companyId: number, dto: CreatePersonalFieldDefinitionDto) {
    const scope = dto.scope || 'GUARDIA';
    const category = dto.category || 'PERSONAL';
    const key = await this.buildUniqueKey(companyId, scope, dto.label);
    const ultimo = await this.prisma.personalFieldDefinition.findFirst({
      where: { companyId, scope },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return this.prisma.personalFieldDefinition.create({
      data: {
        companyId,
        scope,
        category,
        key,
        label: dto.label.trim(),
        type: dto.type,
        order: (ultimo?.order ?? -1) + 1,
      },
    });
  }

  async update(
    id: number,
    companyId: number,
    dto: UpdatePersonalFieldDefinitionDto,
  ) {
    await this.findOne(id, companyId);
    return this.prisma.personalFieldDefinition.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        order: dto.order,
      },
    });
  }

  // No borra los valores ya guardados en GuardiaFichaPersonal.camposPersonalizados
  // (quedan huérfanos bajo esa key, invisibles porque ya no hay definición que
  // los muestre) — mismo criterio de "nunca destruir datos" que el resto del
  // módulo (ver drive.service.ts, syncEntidadesFolder).
  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.personalFieldDefinition.delete({ where: { id } });
  }

  private async findOne(id: number, companyId: number) {
    const def = await this.prisma.personalFieldDefinition.findFirst({
      where: { id, companyId },
    });
    if (!def) throw new NotFoundException('Campo personalizado no encontrado');
    return def;
  }

  private async buildUniqueKey(
    companyId: number,
    scope: string,
    label: string,
  ) {
    const base = label
      .toLowerCase()
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'campo';
    let key = base;
    let suffix = 1;
    while (
      await this.prisma.personalFieldDefinition.findUnique({
        where: { companyId_scope_key: { companyId, scope, key } },
      })
    ) {
      suffix += 1;
      key = `${base}_${suffix}`;
    }
    return key;
  }
}
