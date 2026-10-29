import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePuntoDto, UpdatePuntoDto } from './dto/punto.dto';

/**
 * Puntos de acopio de cada empresa (las sucursales donde se recibe el cacao). Nacen vacíos (línea
 * blanca): mientras una empresa no tenga ninguno, las recepciones no piden punto; apenas tiene uno
 * activo, cada recepción debe decir dónde se recibió. Un punto con recepciones no se borra: se desactiva.
 */
@Injectable()
export class CacaoPuntosService {
  constructor(private readonly prisma: PrismaService) {}

  /** `soloActivos` es lo que ven los formularios; la pantalla de configuración pide todos. */
  async list(companyId: number, soloActivos = true) {
    const puntos = await this.prisma.cacaoPunto.findMany({
      where: { companyId, ...(soloActivos ? { activo: true } : {}) },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { receptions: true } } },
    });
    return puntos.map(({ _count, ...punto }) => ({
      ...punto,
      recepciones: _count.receptions,
    }));
  }

  async create(companyId: number, dto: CreatePuntoDto) {
    await this.asegurarNombreLibre(companyId, dto.nombre);
    return this.prisma.cacaoPunto.create({
      data: { companyId, nombre: dto.nombre, direccion: dto.direccion ?? null },
    });
  }

  async update(companyId: number, id: number, dto: UpdatePuntoDto) {
    const punto = await this.buscar(companyId, id);
    if (dto.nombre !== undefined && dto.nombre !== punto.nombre) {
      await this.asegurarNombreLibre(companyId, dto.nombre, id);
    }
    return this.prisma.cacaoPunto.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async remove(companyId: number, id: number) {
    await this.buscar(companyId, id);
    const usos = await this.prisma.cacaoReception.count({
      where: { companyId, puntoId: id },
    });
    if (usos > 0) {
      throw new ConflictException(
        'Este punto ya tiene recepciones registradas: desactívalo en vez de eliminarlo',
      );
    }
    await this.prisma.cacaoPunto.delete({ where: { id } });
    return { ok: true };
  }

  private async buscar(companyId: number, id: number) {
    const punto = await this.prisma.cacaoPunto.findFirst({
      where: { id, companyId },
    });
    if (!punto)
      throw new NotFoundException('No se encontró el punto de acopio');
    return punto;
  }

  /** Sin repetir nombre dentro de la empresa, sin importar mayúsculas. */
  private async asegurarNombreLibre(
    companyId: number,
    nombre: string,
    exceptoId?: number,
  ) {
    const repetido = await this.prisma.cacaoPunto.findFirst({
      where: {
        companyId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptoId !== undefined ? { id: { not: exceptoId } } : {}),
      },
    });
    if (repetido) {
      throw new ConflictException(
        'Ya existe un punto de acopio con ese nombre',
      );
    }
  }
}
