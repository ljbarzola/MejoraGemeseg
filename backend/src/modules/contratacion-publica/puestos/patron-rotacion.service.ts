import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PatronRotacionConfigDto,
  PreviewPatronDto,
} from './dto/patron-rotacion.dto';
import {
  calcularPatronRotacion,
  ResultadoPatron,
} from '../shared/patron-rotacion.util';

@Injectable()
export class CPPatronRotacionService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatron(puestoId: number, companyId: number) {
    await this.assertPuesto(puestoId, companyId);
    const patron = await this.prisma.cPPatronRotacion.findUnique({
      where: { puestoId },
    });
    if (!patron) return null;
    return {
      ...patron,
      tramos: patron.tramos as unknown,
      ordenGuardias: patron.ordenGuardias as unknown,
    };
  }

  async guardarPatron(
    puestoId: number,
    dto: PatronRotacionConfigDto,
    companyId: number,
  ) {
    await this.assertPuesto(puestoId, companyId);
    await this.assertGuardiasDelPuesto(puestoId, dto.ordenGuardias);
    return this.prisma.cPPatronRotacion.upsert({
      where: { puestoId },
      create: {
        puestoId,
        tramos: dto.tramos as any,
        coberturaSimultanea: dto.coberturaSimultanea,
        ordenGuardias: dto.ordenGuardias as any,
        fechaInicioCiclo: new Date(dto.fechaInicioCiclo),
      },
      update: {
        tramos: dto.tramos as any,
        coberturaSimultanea: dto.coberturaSimultanea,
        ordenGuardias: dto.ordenGuardias as any,
        fechaInicioCiclo: new Date(dto.fechaInicioCiclo),
      },
    });
  }

  async preview(puestoId: number, dto: PreviewPatronDto, companyId: number) {
    await this.assertPuesto(puestoId, companyId);
    await this.assertGuardiasDelPuesto(puestoId, dto.ordenGuardias);
    const resultado = this.calcular(dto);
    if (!resultado.ok) throw new BadRequestException(resultado.error);
    return resultado;
  }

  /** Reutilizado por CPHorariosService.generarPatron — misma validación, sin volver a tocar la BD. */
  calcular(
    dto: PatronRotacionConfigDto & { fechaInicio: string; fechaFin: string },
  ): ResultadoPatron {
    return calcularPatronRotacion({
      tramos: dto.tramos,
      coberturaSimultanea: dto.coberturaSimultanea,
      ordenGuardias: dto.ordenGuardias,
      fechaInicioCiclo: dto.fechaInicioCiclo,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
    });
  }

  async assertGuardiasDelPuesto(
    puestoId: number,
    ordenGuardias: { cedula: string }[],
  ) {
    const asignados = await this.prisma.cPPuestoGuardia.findMany({
      where: { puestoId },
    });
    const cedulasAsignadas = new Set(asignados.map((g) => g.cedula));
    const faltantes = ordenGuardias
      .map((g) => g.cedula)
      .filter((cedula) => !cedulasAsignadas.has(cedula));
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Los siguientes guardias no están asignados a este puesto: ${faltantes.join(', ')}`,
      );
    }
  }

  private async assertPuesto(puestoId: number, companyId: number) {
    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id: puestoId, companyId },
    });
    if (!puesto)
      throw new NotFoundException('Puesto de servicio no encontrado');
    return puesto;
  }
}
