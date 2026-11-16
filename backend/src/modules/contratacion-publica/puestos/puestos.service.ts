import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePuestoDto } from './dto/create-puesto.dto';
import { UpdatePuestoDto } from './dto/update-puesto.dto';
import { AsignarGuardiaDto } from './dto/asignar-guardia.dto';
import type { TurnoPuestoDto } from './dto/create-puesto.dto';

/** Turnos limpios para guardar y el mínimo diario que suman (null = sin turnos: se usa el número a mano). */
function normalizarTurnos(turnos: TurnoPuestoDto[] | undefined) {
  if (turnos === undefined) return undefined;
  const lista = turnos
    .map((t) => ({ nombre: t.nombre.trim(), horaInicio: t.horaInicio || null, horaFin: t.horaFin || null, guardias: t.guardias }))
    .filter((t) => t.nombre);
  return { lista: lista.length ? lista : null, minimo: lista.length ? lista.reduce((n, t) => n + t.guardias, 0) : null };
}

@Injectable()
export class CPPuestosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByContrato(contratoId: number, companyId: number) {
    await this.assertContrato(contratoId, companyId);
    return this.prisma.cPPuestoServicio.findMany({
      where: { contratoId, companyId },
      include: { guardias: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id, companyId },
      include: { guardias: true },
    });
    if (!puesto)
      throw new NotFoundException('Puesto de servicio no encontrado');
    return puesto;
  }

  async create(dto: CreatePuestoDto, companyId: number) {
    await this.assertContrato(dto.contratoId, companyId);
    const turnos = normalizarTurnos(dto.turnos);
    return this.prisma.cPPuestoServicio.create({
      data: {
        contratoId: dto.contratoId,
        nombre: dto.nombre,
        tipoTurno: dto.tipoTurno,
        cantidadGuardias: dto.cantidadGuardias ?? 1,
        guardiasSimultaneosRequeridos: turnos?.minimo ?? dto.guardiasSimultaneosRequeridos ?? 1,
        turnos: turnos?.lista ?? Prisma.DbNull,
        canton: dto.canton,
        edificio: dto.edificio,
        ubicacion: dto.ubicacion,
        companyId,
      },
    });
  }

  async update(id: number, dto: UpdatePuestoDto, companyId: number) {
    await this.findOne(id, companyId);
    const { turnos: turnosDto, ...resto } = dto;
    const turnos = normalizarTurnos(turnosDto);
    const data: Prisma.CPPuestoServicioUpdateInput = { ...resto };
    if (turnos) {
      data.turnos = turnos.lista ?? Prisma.DbNull;
      if (turnos.minimo) data.guardiasSimultaneosRequeridos = turnos.minimo;
    }
    return this.prisma.cPPuestoServicio.update({ where: { id }, data });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPPuestoServicio.delete({ where: { id } });
  }

  async asignarGuardia(
    puestoId: number,
    dto: AsignarGuardiaDto,
    companyId: number,
  ) {
    await this.findOne(puestoId, companyId);
    const yaAsignado = await this.prisma.cPPuestoGuardia.findFirst({
      where: { puestoId, cedula: dto.cedula },
    });
    if (yaAsignado) {
      throw new BadRequestException(
        'Este guardia ya está asignado a este puesto',
      );
    }
    return this.prisma.cPPuestoGuardia.create({
      data: { puestoId, cedula: dto.cedula, nombreGuardia: dto.nombreGuardia },
    });
  }

  async removeGuardia(puestoId: number, guardiaId: number, companyId: number) {
    await this.findOne(puestoId, companyId);
    const guardia = await this.prisma.cPPuestoGuardia.findFirst({
      where: { id: guardiaId, puestoId },
    });
    if (!guardia) throw new NotFoundException('Asignación no encontrada');
    return this.prisma.cPPuestoGuardia.delete({ where: { id: guardiaId } });
  }

  private async assertContrato(contratoId: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id: contratoId, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }
}
