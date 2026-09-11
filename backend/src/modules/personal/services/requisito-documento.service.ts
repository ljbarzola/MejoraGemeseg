import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateRequisitoDocumentoDto,
  UpdateRequisitoDocumentoDto,
} from '../dto/requisito-documento.dto';

@Injectable()
export class RequisitoDocumentoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: number,
    filters?: { aplicaA?: string; entidadId?: number },
  ) {
    return this.prisma.requisitoDocumento.findMany({
      where: {
        companyId,
        ...(filters?.aplicaA ? { aplicaA: filters.aplicaA } : {}),
        ...(filters?.entidadId !== undefined
          ? { entidadId: filters.entidadId }
          : {}),
      },
      include: { entidad: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const requisito = await this.prisma.requisitoDocumento.findFirst({
      where: { id, companyId },
    });
    if (!requisito) throw new NotFoundException('Requisito no encontrado');
    return requisito;
  }

  // aplicaA === 'ENTIDAD' exige entidadId (y que sea de esta empresa);
  // cualquier otro valor de aplicaA debe venir sin entidadId.
  private async validateAplicaA(
    companyId: number,
    aplicaA: string,
    entidadId?: number,
  ) {
    if (aplicaA === 'ENTIDAD') {
      if (!entidadId) {
        throw new BadRequestException(
          'entidadId es obligatorio cuando aplicaA es ENTIDAD.',
        );
      }
      const entidad = await this.prisma.entidad.findFirst({
        where: { id: entidadId, companyId },
      });
      if (!entidad) {
        throw new BadRequestException(
          'La entidad indicada no existe o no pertenece a esta empresa.',
        );
      }
    } else if (entidadId !== undefined && entidadId !== null) {
      throw new BadRequestException(
        'entidadId solo debe indicarse cuando aplicaA es ENTIDAD.',
      );
    }
  }

  // duracionValor/duracionUnidad (cada cuánto vence el documento) deben venir
  // ambos o ninguno — un valor sin unidad (o viceversa) es ambiguo. Null en
  // ambos es válido y significa "este documento no vence". Mismo estilo de
  // mensaje que validateAplicaA.
  private validateDuracion(
    duracionValor?: number | null,
    duracionUnidad?: string | null,
  ) {
    const tieneValor = duracionValor !== undefined && duracionValor !== null;
    const tieneUnidad = duracionUnidad !== undefined && duracionUnidad !== null;
    if (tieneValor !== tieneUnidad) {
      throw new BadRequestException(
        'duracionValor y duracionUnidad deben indicarse juntos, o dejarse ambos vacíos si el documento no vence.',
      );
    }
  }

  async create(companyId: number, dto: CreateRequisitoDocumentoDto) {
    await this.validateAplicaA(companyId, dto.aplicaA, dto.entidadId);
    this.validateDuracion(dto.duracionValor, dto.duracionUnidad);
    return this.prisma.requisitoDocumento.create({
      data: {
        nombre: dto.nombre,
        aplicaA: dto.aplicaA,
        entidadId: dto.aplicaA === 'ENTIDAD' ? dto.entidadId : null,
        duracionValor: dto.duracionValor ?? null,
        duracionUnidad: dto.duracionUnidad ?? null,
        // Con defaults propios en el DTO/schema (30/DIAS), no son
        // obligatorios en el body — a diferencia de duracion, aquí siempre
        // hay un par válido con el que trabajar.
        anticipacionValor: dto.anticipacionValor ?? 30,
        anticipacionUnidad: dto.anticipacionUnidad ?? 'DIAS',
        companyId,
      },
    });
  }

  async update(
    id: number,
    companyId: number,
    dto: UpdateRequisitoDocumentoDto,
  ) {
    const existing = await this.findOne(id, companyId);
    const aplicaA = dto.aplicaA ?? existing.aplicaA;
    const entidadId =
      dto.entidadId !== undefined
        ? dto.entidadId
        : (existing.entidadId ?? undefined);
    await this.validateAplicaA(companyId, aplicaA, entidadId ?? undefined);

    const duracionValor =
      dto.duracionValor !== undefined
        ? dto.duracionValor
        : existing.duracionValor;
    const duracionUnidad =
      dto.duracionUnidad !== undefined
        ? dto.duracionUnidad
        : existing.duracionUnidad;
    this.validateDuracion(duracionValor, duracionUnidad);

    return this.prisma.requisitoDocumento.update({
      where: { id },
      data: {
        ...dto,
        entidadId: aplicaA === 'ENTIDAD' ? entidadId : null,
        duracionValor,
        duracionUnidad,
      },
    });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.requisitoDocumento.delete({ where: { id } });
  }
}
