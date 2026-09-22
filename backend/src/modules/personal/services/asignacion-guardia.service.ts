import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { separarNombre } from '../utils/separar-nombre.util';
import {
  CreateAsignacionGuardiaDto,
  UpdateAsignacionGuardiaDto,
} from '../dto/asignacion-guardia.dto';

@Injectable()
export class AsignacionGuardiaService {
  constructor(private readonly prisma: PrismaService) {}

  // Padrón de guardias de la empresa, tal como lo necesita Listado de
  // Guardias (RRHH). Antes esta pantalla lo pedía a
  // GET /custodias/available-custodios, que está detrás de la sección
  // CUSTODIAS: una empresa con RRHH pero sin Custodias veía la pantalla
  // cargar y luego romperse con "No tienes acceso a CUSTODIAS", sin que ese
  // mensaje tuviera nada que ver con lo que estaba haciendo. El dato en sí
  // es de RRHH (carpetas de Drive de guardias), no del módulo de viajes.
  async findGuardias(companyId: number) {
    const carpetas = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId, folderType: 'CUSTODIAS' },
      orderBy: { employeeName: 'asc' },
    });

    // Apellidos y nombres se muestran en columnas separadas, pero la carpeta
    // los guarda juntos ("APELLIDOS NOMBRES"). El dato exacto está en el
    // formulario de postulación, dentro de la ficha — se traen todas de una
    // vez para no hacer una consulta por guardia (ver separar-nombre.util).
    const fichas = await this.prisma.guardiaFichaPersonal.findMany({
      where: { companyId, cedula: { in: carpetas.map((c) => c.cedula) } },
      select: { cedula: true, camposPersonalizados: true },
    });
    const fichaPorCedula = new Map(
      fichas.map((f) => [
        f.cedula,
        f.camposPersonalizados as Record<string, unknown> | null,
      ]),
    );

    return carpetas
      .map((c) => {
        const { apellidos, nombres, exacto } = separarNombre(
          c.employeeName,
          fichaPorCedula.get(c.cedula),
        );
        return {
          name: c.employeeName,
          apellidos,
          nombres,
          nombreSeparadoExacto: exacto,
          cedula: c.cedula,
          lastSyncAt: c.lastSyncAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

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
