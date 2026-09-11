import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateEntidadDto, UpdateEntidadDto } from '../dto/entidad.dto';

@Injectable()
export class EntidadService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.entidad.findMany({
      where: { companyId },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const entidad = await this.prisma.entidad.findFirst({
      where: { id, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad no encontrada');
    return entidad;
  }

  async create(companyId: number, dto: CreateEntidadDto) {
    return this.prisma.entidad.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        activo: dto.activo ?? true,
        companyId,
      },
    });
  }

  // `tipo` es editable a mano (RRHH puede corregirlo desde Entidades y
  // Requisitos). Esto es independiente del sync de Drive: syncEntidadesFolder
  // sigue solo comparando y avisando si la carpeta no coincide (nunca
  // sobreescribe `tipo` por su cuenta), así que un valor corregido a mano no
  // se pierde en la siguiente sincronización.
  async update(id: number, companyId: number, dto: UpdateEntidadDto) {
    await this.findOne(id, companyId);
    return this.prisma.entidad.update({
      where: { id },
      data: dto,
    });
  }

  // Un borrado físico eliminaría en cascada el historial de AsignacionGuardia
  // que apunta a esta entidad (onDelete: Cascade en el FK). Si ya tiene
  // asignaciones activas, es más seguro forzar a RRHH a desactivarla
  // (activo: false) que perder ese historial en silencio.
  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    const asignacionesActivas = await this.prisma.asignacionGuardia.count({
      where: { entidadId: id, companyId, fechaFin: null },
    });
    if (asignacionesActivas > 0) {
      throw new BadRequestException(
        'Esta entidad tiene asignaciones de guardias activas. Desactívala (activo: false) en vez de eliminarla, o finaliza primero esas asignaciones.',
      );
    }
    return this.prisma.entidad.delete({ where: { id } });
  }
}
