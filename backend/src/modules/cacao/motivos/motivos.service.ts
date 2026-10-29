import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateMotivoDto,
  TIPOS_MOTIVO,
  TipoMotivo,
  UpdateMotivoDto,
} from './dto/motivo.dto';

/**
 * Catálogo de motivos de rechazo y anulación de cada empresa. Nace vacío (línea blanca): la
 * empresa arma el suyo y, mientras no tenga ninguno, las pantallas piden el motivo en texto libre.
 * El motivo elegido se copia como texto a la liquidación o al pago, así que cambiar o borrar uno
 * del catálogo nunca altera lo ya registrado.
 */
@Injectable()
export class CacaoMotivosService {
  constructor(private readonly prisma: PrismaService) {}

  /** `soloActivos` es lo que ven los diálogos; la pantalla de configuración pide todos. */
  async list(companyId: number, tipo?: string, soloActivos = true) {
    if (tipo !== undefined && !TIPOS_MOTIVO.includes(tipo as TipoMotivo)) {
      throw new BadRequestException('El tipo de motivo no es válido');
    }
    return this.prisma.cacaoMotivo.findMany({
      where: {
        companyId,
        ...(tipo ? { tipo } : {}),
        ...(soloActivos ? { activo: true } : {}),
      },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
  }

  async create(companyId: number, dto: CreateMotivoDto) {
    await this.asegurarNombreLibre(companyId, dto.tipo, dto.nombre);
    return this.prisma.cacaoMotivo.create({
      data: { companyId, tipo: dto.tipo, nombre: dto.nombre },
    });
  }

  async update(companyId: number, id: number, dto: UpdateMotivoDto) {
    const motivo = await this.buscar(companyId, id);
    if (dto.nombre !== undefined && dto.nombre !== motivo.nombre) {
      await this.asegurarNombreLibre(companyId, motivo.tipo, dto.nombre, id);
    }
    return this.prisma.cacaoMotivo.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async remove(companyId: number, id: number) {
    await this.buscar(companyId, id);
    await this.prisma.cacaoMotivo.delete({ where: { id } });
    return { ok: true };
  }

  private async buscar(companyId: number, id: number) {
    const motivo = await this.prisma.cacaoMotivo.findFirst({
      where: { id, companyId },
    });
    if (!motivo) throw new NotFoundException('No se encontró el motivo');
    return motivo;
  }

  /** Sin repetir nombre dentro del mismo tipo, sin importar mayúsculas. */
  private async asegurarNombreLibre(
    companyId: number,
    tipo: string,
    nombre: string,
    exceptoId?: number,
  ) {
    const repetido = await this.prisma.cacaoMotivo.findFirst({
      where: {
        companyId,
        tipo,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptoId !== undefined ? { id: { not: exceptoId } } : {}),
      },
    });
    if (repetido) {
      throw new ConflictException('Ya existe un motivo con ese nombre');
    }
  }
}
