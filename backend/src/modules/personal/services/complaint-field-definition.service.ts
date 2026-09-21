import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface UpsertComplaintFieldInput {
  label: string;
  type?: string;
  required?: boolean;
  order?: number;
}

// Campos extra que RRHH agrega al formulario de "Enviar una queja" (ej.
// Departamento, Cargo) — mismo patrón que PersonalFieldDefinition.
@Injectable()
export class ComplaintFieldDefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.complaintFieldDefinition.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
  }

  async create(companyId: number, data: UpsertComplaintFieldInput) {
    const count = await this.prisma.complaintFieldDefinition.count({ where: { companyId } });
    return this.prisma.complaintFieldDefinition.create({
      data: {
        companyId,
        label: data.label.trim(),
        type: data.type || 'TEXT',
        required: data.required ?? false,
        order: data.order ?? count,
      },
    });
  }

  async update(id: number, companyId: number, data: Partial<UpsertComplaintFieldInput>) {
    const field = await this.prisma.complaintFieldDefinition.findFirst({ where: { id, companyId } });
    if (!field) throw new NotFoundException('Campo no encontrado');
    return this.prisma.complaintFieldDefinition.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label.trim() } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.required !== undefined ? { required: data.required } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
      },
    });
  }

  async delete(id: number, companyId: number) {
    const field = await this.prisma.complaintFieldDefinition.findFirst({ where: { id, companyId } });
    if (!field) throw new NotFoundException('Campo no encontrado');
    return this.prisma.complaintFieldDefinition.delete({ where: { id } });
  }
}
