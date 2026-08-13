import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CertificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.certification.findMany({ where: { companyId }, orderBy: { expiryDate: 'asc' } });
  }

  async create(data: any, companyId: number, userId: number) {
    return this.prisma.certification.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async update(id: number, data: any, companyId: number) {
    const c = await this.prisma.certification.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Certificación no encontrada');
    return this.prisma.certification.update({ where: { id }, data });
  }

  async delete(id: number, companyId: number) {
    const c = await this.prisma.certification.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Certificación no encontrada');
    return this.prisma.certification.delete({ where: { id } });
  }

  async getAlerts(companyId: number) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return this.prisma.certification.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        expiryDate: { gte: now, lte: in30Days },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }
}
