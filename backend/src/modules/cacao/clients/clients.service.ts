import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class CacaoClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cacaoClient.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateClientDto, companyId: number) {
    return this.prisma.cacaoClient.create({
      data: { ...dto, companyId },
    });
  }

  async update(id: number, dto: UpdateClientDto, companyId: number) {
    const client = await this.prisma.cacaoClient.findFirst({ where: { id, companyId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.cacaoClient.update({ where: { id }, data: dto });
  }

  async remove(id: number, companyId: number) {
    const client = await this.prisma.cacaoClient.findFirst({ where: { id, companyId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.cacaoClient.delete({ where: { id } });
  }
}
