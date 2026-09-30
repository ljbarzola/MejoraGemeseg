import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePuestoDto } from './dto/create-puesto.dto';
import { UpdatePuestoDto } from './dto/update-puesto.dto';
import { AsignarGuardiaDto } from './dto/asignar-guardia.dto';

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
    return this.prisma.cPPuestoServicio.create({
      data: {
        contratoId: dto.contratoId,
        nombre: dto.nombre,
        tipoTurno: dto.tipoTurno,
        cantidadGuardias: dto.cantidadGuardias ?? 1,
        guardiasSimultaneosRequeridos: dto.guardiasSimultaneosRequeridos ?? 1,
        companyId,
      },
    });
  }

  async update(id: number, dto: UpdatePuestoDto, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPPuestoServicio.update({ where: { id }, data: dto });
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
