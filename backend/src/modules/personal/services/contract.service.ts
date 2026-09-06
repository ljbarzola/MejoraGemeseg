import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplates(companyId: number) {
    return this.prisma.contractTemplate.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(data: any, companyId: number, userId: number) {
    return this.prisma.contractTemplate.create({
      data: { ...data, companyId, createdBy: userId },
    });
  }

  async deleteTemplate(id: number, companyId: number) {
    const t = await this.prisma.contractTemplate.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    return this.prisma.contractTemplate.delete({ where: { id } });
  }

  async generateContract(candidateId: number, templateId: number, companyId: number, userId: number) {
    const candidate = await this.prisma.candidate.findFirst({ where: { id: candidateId, companyId } });
    if (!candidate) throw new NotFoundException('Candidato no encontrado');

    const template = await this.prisma.contractTemplate.findFirst({ where: { id: templateId, companyId } });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    return this.prisma.contract.create({
      data: {
        candidateId,
        templateId,
        status: 'DRAFT',
        companyId,
        createdBy: userId,
      },
    });
  }

  async getContracts(companyId: number) {
    return this.prisma.contract.findMany({
      where: { companyId },
      include: { candidate: true, template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateContract(id: number, data: any, companyId: number) {
    const c = await this.prisma.contract.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Contrato no encontrado');
    return this.prisma.contract.update({ where: { id }, data });
  }

  /** Contrato con todo lo que el generador de PDF necesita para rellenar la plantilla. */
  async getContractForDocument(id: number, companyId: number) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, companyId },
      include: { candidate: true, template: true, company: true },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return contract;
  }
}
