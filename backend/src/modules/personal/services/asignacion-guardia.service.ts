import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateAsignacionGuardiaDto,
  UpdateAsignacionGuardiaDto,
} from '../dto/asignacion-guardia.dto';

@Injectable()
export class AsignacionGuardiaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: number,
    filters?: { cedula?: string; entidadId?: number; activasOnly?: boolean },
  ) {
    return this.prisma.asignacionGuardia.findMany({
      where: {
        companyId,
        ...(filters?.cedula ? { cedula: filters.cedula } : {}),
        ...(filters?.entidadId !== undefined
          ? { entidadId: filters.entidadId }
          : {}),
        ...(filters?.activasOnly ? { fechaFin: null } : {}),
      },
      include: { entidad: true },
      orderBy: { fechaInicio: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const asignacion = await this.prisma.asignacionGuardia.findFirst({
      where: { id, companyId },
    });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');
    return asignacion;
  }

  // Deliberadamente NO cierra ninguna asignación previa abierta de esta
  // misma cédula: un guardia podría legítimamente estar doble-asignado, y
  // cerrar la anterior debe ser una acción explícita (ver finalizar()).
  async create(
    companyId: number,
    userId: number,
    dto: CreateAsignacionGuardiaDto,
  ) {
    return this.prisma.asignacionGuardia.create({
      data: {
        cedula: dto.cedula,
        nombreGuardia: dto.nombreGuardia,
        entidadId: dto.entidadId,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null,
        companyId,
        createdBy: userId,
      },
    });
  }

  async update(id: number, companyId: number, dto: UpdateAsignacionGuardiaDto) {
    await this.findOne(id, companyId);
    return this.prisma.asignacionGuardia.update({
      where: { id },
      data: {
        ...dto,
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
        fechaFin:
          dto.fechaFin !== undefined
            ? dto.fechaFin
              ? new Date(dto.fechaFin)
              : null
            : undefined,
      },
    });
  }

  async getHistorial(cedula: string, companyId: number) {
    return this.prisma.asignacionGuardia.findMany({
      where: { cedula, companyId },
      include: { entidad: true },
      orderBy: { fechaInicio: 'desc' },
    });
  }

  // Cierra la asignación (fechaFin = fecha dada o ahora). Esta es la forma
  // normal de terminar una asignación — DELETE queda solo para filas creadas
  // por error.
  async finalizar(id: number, companyId: number, fechaFin?: Date) {
    await this.findOne(id, companyId);
    return this.prisma.asignacionGuardia.update({
      where: { id },
      data: { fechaFin: fechaFin ?? new Date() },
    });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.asignacionGuardia.delete({ where: { id } });
  }
}
