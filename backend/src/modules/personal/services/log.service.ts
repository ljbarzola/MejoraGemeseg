import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class LogService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplates(companyId: number) {
    return this.prisma.logTemplate.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(data: any, companyId: number, userId: number) {
    return this.prisma.logTemplate.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async deleteTemplate(id: number, companyId: number) {
    const t = await this.prisma.logTemplate.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    return this.prisma.logTemplate.delete({ where: { id } });
  }

  async getEntries(companyId: number) {
    return this.prisma.logEntry.findMany({ where: { companyId }, include: { template: true }, orderBy: { createdAt: 'desc' } });
  }

  async createEntry(data: any, companyId: number, userId: number) {
    // Sin esta comprobacion se podia enlazar la plantilla de otra empresa y
    // getEntries (include: template) devolvia su contenido.
    if (data.templateId != null) {
      const template = await this.prisma.logTemplate.findFirst({ where: { id: data.templateId, companyId } });
      if (!template) throw new NotFoundException('Plantilla no encontrada');
    }
    return this.prisma.logEntry.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async deleteEntry(id: number, companyId: number) {
    const e = await this.prisma.logEntry.findFirst({ where: { id, companyId } });
    if (!e) throw new NotFoundException('Registro no encontrado');
    return this.prisma.logEntry.delete({ where: { id } });
  }
}
