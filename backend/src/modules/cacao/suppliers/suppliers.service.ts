import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class CacaoSuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cacaoSupplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateSupplierDto, companyId: number) {
    return this.prisma.cacaoSupplier.create({
      data: { ...dto, companyId },
    });
  }

  async update(id: number, dto: UpdateSupplierDto, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return this.prisma.cacaoSupplier.update({ where: { id }, data: dto });
  }

  async remove(id: number, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return this.prisma.cacaoSupplier.delete({ where: { id } });
  }
}
