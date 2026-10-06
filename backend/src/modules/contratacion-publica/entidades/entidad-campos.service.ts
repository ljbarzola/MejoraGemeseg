import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateEntidadCampoDto,
  UpdateEntidadCampoDto,
} from './dto/entidad-campo.dto';
import { claveNombre } from './entidad-folder.util';
import { CAMPOS_DE_FABRICA, limpiarOpciones } from './entidad-campos.util';

/**
 * Definición de los campos extra de las entidades públicas (tipo de entidad,
 * contacto, provincia...). Los campos nunca se borran, solo se desactivan,
 * para que los valores ya guardados en las entidades no queden sin definición.
 */
@Injectable()
export class CPEntidadCamposService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos los campos de la empresa (activos y desactivados). La primera vez crea los de fábrica. */
  async listar(companyId: number) {
    const hay = await this.prisma.cPEntidadCampo.count({ where: { companyId } });
    if (hay === 0) {
      await this.prisma.cPEntidadCampo.createMany({
        data: CAMPOS_DE_FABRICA.map((c, i) => ({
          companyId,
          nombre: c.nombre,
          tipo: c.tipo,
          opciones: c.opciones ?? undefined,
          orden: i,
        })),
        skipDuplicates: true,
      });
    }
    return this.prisma.cPEntidadCampo.findMany({
      where: { companyId },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crear(dto: CreateEntidadCampoDto, companyId: number) {
    const nombre = dto.nombre.trim();
    if (!nombre) throw new BadRequestException('El nombre del campo es obligatorio.');
    await this.assertNombreLibre(nombre, companyId);

    const opciones = dto.tipo === 'LISTA' ? limpiarOpciones(dto.opciones) : null;
    if (dto.tipo === 'LISTA' && (opciones?.length ?? 0) === 0) {
      throw new BadRequestException('Una lista necesita al menos una opción.');
    }
    const ultimo = await this.prisma.cPEntidadCampo.findFirst({
      where: { companyId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    return this.prisma.cPEntidadCampo.create({
      data: {
        companyId,
        nombre,
        tipo: dto.tipo,
        opciones: opciones ?? undefined,
        obligatorio: dto.obligatorio ?? false,
        orden: (ultimo?.orden ?? -1) + 1,
      },
    });
  }

  async actualizar(id: number, dto: UpdateEntidadCampoDto, companyId: number) {
    const campo = await this.prisma.cPEntidadCampo.findFirst({
      where: { id, companyId },
    });
    if (!campo) throw new NotFoundException('Campo no encontrado.');

    const data: Record<string, unknown> = {};
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre del campo es obligatorio.');
      await this.assertNombreLibre(nombre, companyId, id);
      data.nombre = nombre;
    }
    if (dto.opciones !== undefined && campo.tipo === 'LISTA') {
      const opciones = limpiarOpciones(dto.opciones);
      if (opciones.length === 0) {
        throw new BadRequestException('Una lista necesita al menos una opción.');
      }
      data.opciones = opciones;
    }
    if (dto.obligatorio !== undefined) data.obligatorio = dto.obligatorio;
    if (dto.activo !== undefined) data.activo = dto.activo;

    return this.prisma.cPEntidadCampo.update({ where: { id }, data });
  }

  /** Guarda el orden en que llegan los ids; los que no sean de la empresa se ignoran. */
  async reordenar(ids: number[], companyId: number) {
    const propios = await this.prisma.cPEntidadCampo.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true },
    });
    const validos = new Set(propios.map((c) => c.id));
    const ordenados = ids.filter((id) => validos.has(id));
    await this.prisma.$transaction(
      ordenados.map((id, orden) =>
        this.prisma.cPEntidadCampo.update({ where: { id }, data: { orden } }),
      ),
    );
    return this.listar(companyId);
  }

  private async assertNombreLibre(nombre: string, companyId: number, exceptoId?: number) {
    const clave = claveNombre(nombre);
    const todos = await this.prisma.cPEntidadCampo.findMany({
      where: { companyId },
      select: { id: true, nombre: true },
    });
    if (todos.some((c) => c.id !== exceptoId && claveNombre(c.nombre) === clave)) {
      throw new BadRequestException('Ya existe un campo con ese nombre.');
    }
  }
}
