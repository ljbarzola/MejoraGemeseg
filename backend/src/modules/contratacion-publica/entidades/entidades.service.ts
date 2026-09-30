import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateEntidadDto } from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';

@Injectable()
export class CPEntidadesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cPEntidadPublica.findMany({
      where: { companyId },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const entidad = await this.prisma.cPEntidadPublica.findFirst({
      where: { id, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad pública no encontrada');
    return entidad;
  }

  async create(dto: CreateEntidadDto, companyId: number) {
    return this.prisma.cPEntidadPublica.create({
      data: { ...dto, companyId },
    });
  }

  async update(id: number, dto: UpdateEntidadDto, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPEntidadPublica.update({ where: { id }, data: dto });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPEntidadPublica.delete({ where: { id } });
  }
}
