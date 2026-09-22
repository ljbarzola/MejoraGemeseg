import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const CORE_CLIENT_FIELDS = [
  { key: 'name', label: 'Nombre / Razón social', fieldType: 'TEXT' },
  { key: 'email', label: 'Email', fieldType: 'EMAIL' },
  { key: 'phone', label: 'Teléfono', fieldType: 'TEXT' },
  { key: 'ruc', label: 'Cédula / RUC', fieldType: 'TEXT' },
  { key: 'address', label: 'Dirección', fieldType: 'TEXT' },
] as const;

@Injectable()
export class VentasClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCoreFields(companyId: number) {
    const existing = await this.prisma.salesClientField.findMany({
      where: { companyId, isCore: true },
      select: { key: true },
    });
    const have = new Set(existing.map((f) => f.key));
    let order = 0;
    for (const core of CORE_CLIENT_FIELDS) {
      if (have.has(core.key)) continue;
      await this.prisma.salesClientField.create({
        data: {
          companyId,
          key: core.key,
          label: core.label,
          fieldType: core.fieldType,
          isCore: true,
          order,
        },
      });
      order += 1;
    }
  }

  async listFields(companyId: number | null) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    return this.prisma.salesClientField.findMany({
      where: { companyId },
      orderBy: [{ isCore: 'desc' }, { order: 'asc' }, { id: 'asc' }],
    });
  }

  async addField(companyId: number | null, dto: { label: string; key?: string; fieldType?: string; order?: number }) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    const label = (dto.label || '').trim();
    if (!label) throw new BadRequestException('La etiqueta es requerida');
    const key =
      (dto.key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') ||
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40);
    if (!key) throw new BadRequestException('No se pudo generar una clave para el campo');
    const exists = await this.prisma.salesClientField.findFirst({
      where: { companyId, key },
    });
    if (exists) throw new BadRequestException(`Ya existe un campo con la clave "${key}"`);
    const maxOrder = await this.prisma.salesClientField.aggregate({
      where: { companyId },
      _max: { order: true },
    });
    return this.prisma.salesClientField.create({
      data: {
        companyId,
        key,
        label,
        fieldType: dto.fieldType || 'TEXT',
        isCore: false,
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
      },
    });
  }

  async deleteField(companyId: number | null, fieldId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const field = await this.prisma.salesClientField.findFirst({
      where: { id: fieldId, companyId },
    });
    if (!field) throw new NotFoundException('Campo no encontrado');
    if (field.isCore) throw new BadRequestException('No se puede eliminar un campo núcleo');
    await this.prisma.salesClientField.delete({ where: { id: field.id } });
    return { success: true };
  }

  async listClients(companyId: number | null) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    return this.prisma.salesClient.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async getClient(companyId: number | null, id: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const client = await this.prisma.salesClient.findFirst({
      where: { id, companyId },
      include: { creator: { select: { id: true, fullName: true } } },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async createClient(companyId: number | null, createdBy: number, dto: any) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    if (!dto?.name?.trim()) throw new BadRequestException('El nombre es requerido');
    if (!dto?.email?.trim()) throw new BadRequestException('El email es requerido');
    await this.ensureCoreFields(companyId);
    return this.prisma.salesClient.create({
      data: {
        companyId,
        createdBy,
        name: dto.name.trim(),
        email: dto.email.trim(),
        phone: dto.phone?.trim() || null,
        ruc: dto.ruc?.trim() || null,
        address: dto.address?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        extra: dto.extra || {},
      },
      include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async updateClient(companyId: number | null, id: number, dto: any) {
    await this.getClient(companyId, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim();
    if (dto.email !== undefined) data.email = String(dto.email).trim();
    if (dto.phone !== undefined) data.phone = dto.phone ? String(dto.phone).trim() : null;
    if (dto.ruc !== undefined) data.ruc = dto.ruc ? String(dto.ruc).trim() : null;
    if (dto.address !== undefined) data.address = dto.address ? String(dto.address).trim() : null;
    if (dto.observaciones !== undefined) data.observaciones = dto.observaciones ? String(dto.observaciones).trim() : null;
    if (dto.extra !== undefined) data.extra = dto.extra;
    return this.prisma.salesClient.update({
      where: { id },
      data,
      include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async deleteClient(companyId: number | null, id: number) {
    await this.getClient(companyId, id);
    await this.prisma.salesClient.delete({ where: { id } });
    return { success: true };
  }

  static valueOf(client: { name: string; email: string; phone: string | null; ruc: string | null; address: string | null; extra: any }, key: string): string {
    if (key === 'name') return client.name || '';
    if (key === 'email') return client.email || '';
    if (key === 'phone') return client.phone || '';
    if (key === 'ruc') return client.ruc || '';
    if (key === 'address') return client.address || '';
    const extra = (client.extra && typeof client.extra === 'object') ? client.extra : {};
    return extra[key] != null ? String(extra[key]) : '';
  }
}
