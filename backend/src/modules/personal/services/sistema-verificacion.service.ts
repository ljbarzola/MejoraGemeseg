import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SistemaVerificacionService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: number, soloActivos = false) {
    return this.prisma.sistemaVerificacion.findMany({
      where: { companyId, ...(soloActivos ? { activo: true } : {}) },
      orderBy: { orden: 'asc' },
    });
  }

  async create(
    companyId: number,
    data: { nombre: string; urlPortal?: string; orden?: number },
  ) {
    const existing = await this.prisma.sistemaVerificacion.findFirst({
      where: { companyId, nombre: data.nombre },
    });
    if (existing) {
      throw new ConflictException('Ya existe un sistema con ese nombre');
    }
    let orden = data.orden;
    if (orden === undefined) {
      const maxOrden = await this.prisma.sistemaVerificacion.aggregate({
        where: { companyId },
        _max: { orden: true },
      });
      orden = (maxOrden._max.orden || 0) + 1;
    }
    return this.prisma.sistemaVerificacion.create({
      data: {
        nombre: data.nombre,
        urlPortal: data.urlPortal || null,
        orden,
        companyId,
      },
    });
  }

  async update(
    id: number,
    companyId: number,
    data: {
      nombre?: string;
      urlPortal?: string;
      activo?: boolean;
      orden?: number;
    },
  ) {
    const existing = await this.prisma.sistemaVerificacion.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Sistema no encontrado');
    return this.prisma.sistemaVerificacion.update({ where: { id }, data });
  }

  async remove(id: number, companyId: number) {
    const existing = await this.prisma.sistemaVerificacion.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Sistema no encontrado');
    return this.prisma.sistemaVerificacion.delete({ where: { id } });
  }
}
