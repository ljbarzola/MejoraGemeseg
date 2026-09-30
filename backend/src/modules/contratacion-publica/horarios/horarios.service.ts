import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateHorarioDto } from './dto/create-horario.dto';
import { UpsertCeldaDto } from './dto/upsert-celda.dto';
import { ReemplazarCeldasPuestoDto } from './dto/reemplazar-celdas-puesto.dto';
import { IntercambiarTurnoDto } from './dto/intercambiar-turno.dto';
import { CambiarEstadoHorarioDto } from './dto/cambiar-estado-horario.dto';
import { GenerarPatronDto } from './dto/generar-patron.dto';
import { HorarioPdfData } from './horarios-pdf.service';
import { CPPatronRotacionService } from '../puestos/patron-rotacion.service';
import {
  formatFechaISO,
  formatRangoFechas,
  listaFechasEnRango,
  parseFechaUTC,
} from '../shared/fecha-rango.util';

/**
 * Flujo Borrador → Enviado → Aprobado/Rechazado. Solo se valida aquí (no a
 * nivel de constraint de BD, ver plan). Rechazado puede volver a Borrador
 * para corregir y reenviar; Aprobado es terminal.
 */
const TRANSICIONES: Record<string, string[]> = {
  BORRADOR: ['ENVIADO'],
  ENVIADO: ['APROBADO', 'RECHAZADO'],
  RECHAZADO: ['BORRADOR'],
  APROBADO: [],
};

@Injectable()
export class CPHorariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patronRotacionService: CPPatronRotacionService,
  ) {}

  async findAllByContrato(contratoId: number, companyId: number) {
    await this.assertContrato(contratoId, companyId);
    return this.prisma.cPHorarioMensual.findMany({
      where: { contratoId, companyId },
      orderBy: [{ fechaInicio: 'desc' }],
    });
  }

  async findOne(id: number, companyId: number) {
    const horario = await this.prisma.cPHorarioMensual.findFirst({
      where: { id, companyId },
      include: {
        contrato: { include: { entidad: true } },
        celdas: {
          orderBy: [{ puestoId: 'asc' }, { cedula: 'asc' }, { fecha: 'asc' }],
        },
      },
    });
    if (!horario) throw new NotFoundException('Horario mensual no encontrado');
    return horario;
  }

  async create(dto: CreateHorarioDto, companyId: number, createdBy: number) {
    await this.assertContrato(dto.contratoId, companyId);

    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = new Date(dto.fechaFin);
    if (fechaFin < fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la fecha de inicio',
      );
    }

    await this.assertSinSolapamiento(dto.contratoId, fechaInicio, fechaFin);

    return this.prisma.cPHorarioMensual.create({
      data: {
        contratoId: dto.contratoId,
        fechaInicio,
        fechaFin,
        anio: fechaInicio.getUTCFullYear(),
        mes: fechaInicio.getUTCMonth() + 1,
        companyId,
        createdBy,
      },
    });
  }

  async remove(id: number, companyId: number) {
    const horario = await this.assertHorario(id, companyId);
    if (horario.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'Solo se puede eliminar un horario en estado Borrador',
      );
    }
    return this.prisma.cPHorarioMensual.delete({ where: { id } });
  }

  // ==================== CELDAS ====================

  async upsertCelda(id: number, dto: UpsertCeldaDto, companyId: number) {
    const horario = await this.assertEditable(id, companyId);
    await this.assertPuestoDeContrato(dto.puestoId, horario.contratoId);

    const fecha = new Date(dto.fecha);
    return this.prisma.cPHorarioCelda.upsert({
      where: {
        horarioId_puestoId_cedula_fecha: {
          horarioId: id,
          puestoId: dto.puestoId,
          cedula: dto.cedula,
          fecha,
        },
      },
      create: {
        horarioId: id,
        puestoId: dto.puestoId,
        cedula: dto.cedula,
        nombreGuardia: dto.nombreGuardia,
        fecha,
        codigoTurno: dto.codigoTurno,
      },
      update: {
        nombreGuardia: dto.nombreGuardia,
        codigoTurno: dto.codigoTurno,
      },
    });
  }

  /**
   * Reemplaza de una sola vez todas las celdas de un puesto dentro de este
   * horario — trivial gracias a que la matriz es una tabla de celdas, no N
   * columnas físicas por día (ver plan).
   */
  async reemplazarCeldasPuesto(
    id: number,
    dto: ReemplazarCeldasPuestoDto,
    companyId: number,
  ) {
    const horario = await this.assertEditable(id, companyId);
    await this.assertPuestoDeContrato(dto.puestoId, horario.contratoId);

    return this.prisma.$transaction((tx) =>
      this.replaceCeldasPuestoTx(tx, id, dto.puestoId, dto.celdas),
    );
  }

  /**
   * Calcula el patrón de rotación (misma validación que el preview) y, si es
   * válido, reemplaza las celdas del puesto para este horario y opcionalmente
   * guarda la configuración del patrón para reutilizarla el próximo período.
   */
  async generarPatron(id: number, dto: GenerarPatronDto, companyId: number) {
    const horario = await this.assertEditable(id, companyId);
    await this.assertPuestoDeContrato(dto.puestoId, horario.contratoId);
    await this.patronRotacionService.assertGuardiasDelPuesto(
      dto.puestoId,
      dto.patron.ordenGuardias,
    );

    const resultado = this.patronRotacionService.calcular({
      ...dto.patron,
      fechaInicio: formatFechaISO(parseFechaUTC(horario.fechaInicio)),
      fechaFin: formatFechaISO(parseFechaUTC(horario.fechaFin)),
    });
    if (!resultado.ok) throw new BadRequestException(resultado.error);

    const guardarPatron = dto.guardarComoPatronDelPuesto ?? true;

    return this.prisma.$transaction(async (tx) => {
      if (guardarPatron) {
        await tx.cPPatronRotacion.upsert({
          where: { puestoId: dto.puestoId },
          create: {
            puestoId: dto.puestoId,
            tramos: dto.patron.tramos as any,
            coberturaSimultanea: dto.patron.coberturaSimultanea,
            ordenGuardias: dto.patron.ordenGuardias as any,
            fechaInicioCiclo: new Date(dto.patron.fechaInicioCiclo),
          },
          update: {
            tramos: dto.patron.tramos as any,
            coberturaSimultanea: dto.patron.coberturaSimultanea,
            ordenGuardias: dto.patron.ordenGuardias as any,
            fechaInicioCiclo: new Date(dto.patron.fechaInicioCiclo),
          },
        });
      }
      return this.replaceCeldasPuestoTx(tx, id, dto.puestoId, resultado.celdas);
    });
  }

  private async replaceCeldasPuestoTx(
    tx: any,
    horarioId: number,
    puestoId: number,
    celdas: {
      cedula: string;
      nombreGuardia: string;
      fecha: string;
      codigoTurno: string;
    }[],
  ) {
    await tx.cPHorarioCelda.deleteMany({
      where: { horarioId, puestoId },
    });
    if (celdas.length > 0) {
      await tx.cPHorarioCelda.createMany({
        data: celdas.map((c) => ({
          horarioId,
          puestoId,
          cedula: c.cedula,
          nombreGuardia: c.nombreGuardia,
          fecha: new Date(c.fecha),
          codigoTurno: c.codigoTurno,
        })),
      });
    }
    return tx.cPHorarioCelda.findMany({
      where: { horarioId, puestoId },
    });
  }

  /**
   * Intercambia el código de turno entre dos guardias del mismo puesto en un
   * día puntual — sin flujo de solicitud/aprobación separado ni historial,
   * solo el estado vigente de la matriz (ver plan).
   */
  async intercambiarTurno(
    id: number,
    dto: IntercambiarTurnoDto,
    companyId: number,
  ) {
    const horario = await this.assertEditable(id, companyId);
    await this.assertPuestoDeContrato(dto.puestoId, horario.contratoId);
    const fecha = new Date(dto.fecha);

    const [celdaA, celdaB] = await Promise.all([
      this.prisma.cPHorarioCelda.findFirst({
        where: {
          horarioId: id,
          puestoId: dto.puestoId,
          cedula: dto.cedulaA,
          fecha,
        },
      }),
      this.prisma.cPHorarioCelda.findFirst({
        where: {
          horarioId: id,
          puestoId: dto.puestoId,
          cedula: dto.cedulaB,
          fecha,
        },
      }),
    ]);
    if (!celdaA || !celdaB) {
      throw new NotFoundException(
        'No se encontró el turno de uno de los dos guardias en ese puesto y fecha',
      );
    }

    return this.prisma.$transaction([
      this.prisma.cPHorarioCelda.update({
        where: { id: celdaA.id },
        data: { codigoTurno: celdaB.codigoTurno },
      }),
      this.prisma.cPHorarioCelda.update({
        where: { id: celdaB.id },
        data: { codigoTurno: celdaA.codigoTurno },
      }),
    ]);
  }

  // ==================== FLUJO DE ESTADOS ====================

  async cambiarEstado(
    id: number,
    dto: CambiarEstadoHorarioDto,
    companyId: number,
  ) {
    const horario = await this.assertHorario(id, companyId);
    const permitidas = TRANSICIONES[horario.estado] || [];
    if (!permitidas.includes(dto.estado)) {
      throw new BadRequestException(
        `No se puede pasar de ${horario.estado} a ${dto.estado}`,
      );
    }

    if (dto.estado === 'ENVIADO') {
      const errores = await this.validarCoberturaHorario(id, companyId);
      if (errores.length > 0) {
        throw new BadRequestException(
          `No se puede enviar el horario, hay días sin la cobertura mínima requerida:\n${errores.join('\n')}`,
        );
      }
    }

    const data: any = { estado: dto.estado };
    if (dto.estado === 'ENVIADO') data.enviadoAt = new Date();
    if (dto.estado === 'APROBADO') data.aprobadoAt = new Date();
    if (dto.estado === 'RECHAZADO') {
      data.motivoRechazo = dto.motivoRechazo || null;
    }
    if (dto.estado === 'BORRADOR') {
      data.motivoRechazo = null;
      data.enviadoAt = null;
      data.aprobadoAt = null;
    }

    return this.prisma.cPHorarioMensual.update({ where: { id }, data });
  }

  /**
   * Por cada puesto con guardiasSimultaneosRequeridos, cuenta cuántas celdas
   * de ese puesto/día tienen un código que NO está marcado como descanso, y
   * lo compara contra el mínimo configurado. Devuelve TODOS los
   * incumplimientos encontrados (no solo el primero), tal como se pidió.
   */
  async validarCoberturaHorario(
    id: number,
    companyId: number,
  ): Promise<string[]> {
    const horario = await this.prisma.cPHorarioMensual.findFirst({
      where: { id, companyId },
    });
    if (!horario) throw new NotFoundException('Horario mensual no encontrado');

    const [puestos, celdas, codigos] = await Promise.all([
      this.prisma.cPPuestoServicio.findMany({
        where: { contratoId: horario.contratoId },
      }),
      this.prisma.cPHorarioCelda.findMany({ where: { horarioId: id } }),
      this.prisma.cPCodigoTurno.findMany({ where: { companyId } }),
    ]);

    const esDescanso = new Map(codigos.map((c) => [c.codigo, c.esDescanso]));
    const fechas = listaFechasEnRango(horario.fechaInicio, horario.fechaFin);
    const errores: string[] = [];

    for (const puesto of puestos) {
      const requerido = puesto.guardiasSimultaneosRequeridos;
      const celdasPuesto = celdas.filter((c) => c.puestoId === puesto.id);
      for (const fecha of fechas) {
        const trabajando = celdasPuesto.filter((c) => {
          if (formatFechaISO(parseFechaUTC(c.fecha)) !== fecha) return false;
          return !esDescanso.get(c.codigoTurno);
        }).length;
        if (trabajando < requerido) {
          const [anio, mes, dia] = fecha.split('-');
          errores.push(
            `${dia}/${mes}/${anio} - ${puesto.nombre}: ${trabajando} guardia(s) trabajando, se requieren ${requerido}.`,
          );
        }
      }
    }
    return errores;
  }

  // ==================== EXPORTAR PDF / EXCEL ====================

  /**
   * Arma los datos ya agrupados por puesto (guardia -> {fecha: código}) que
   * `CPHorariosPdfService`/`CPHorariosExcelService` necesitan para dibujar la
   * tabla — usa el rango real de fechas del horario, no un mes calendario.
   */
  async getPdfData(id: number, companyId: number): Promise<HorarioPdfData> {
    const horario = await this.prisma.cPHorarioMensual.findFirst({
      where: { id, companyId },
      include: {
        contrato: { include: { entidad: true } },
        celdas: true,
      },
    });
    if (!horario) throw new NotFoundException('Horario mensual no encontrado');

    const puestos = await this.prisma.cPPuestoServicio.findMany({
      where: { contratoId: horario.contratoId },
      orderBy: { nombre: 'asc' },
    });

    const codigos = await this.prisma.cPCodigoTurno.findMany({
      where: { companyId },
    });
    const colorPorCodigo = new Map(codigos.map((c) => [c.codigo, c.color]));

    const fechas = listaFechasEnRango(horario.fechaInicio, horario.fechaFin);

    const puestosPdf = puestos.map((puesto) => {
      const celdasPuesto = horario.celdas.filter(
        (c) => c.puestoId === puesto.id,
      );
      const porGuardia = new Map<
        string,
        { nombreGuardia: string; porFecha: Record<string, string> }
      >();
      for (const celda of celdasPuesto) {
        if (!porGuardia.has(celda.cedula)) {
          porGuardia.set(celda.cedula, {
            nombreGuardia: celda.nombreGuardia,
            porFecha: {},
          });
        }
        const fecha = formatFechaISO(parseFechaUTC(celda.fecha));
        porGuardia.get(celda.cedula)!.porFecha[fecha] = celda.codigoTurno;
      }
      return {
        nombre: puesto.nombre,
        tipoTurno: puesto.tipoTurno,
        filas: Array.from(porGuardia.entries()).map(([cedula, v]) => ({
          cedula,
          nombreGuardia: v.nombreGuardia,
          porFecha: v.porFecha,
        })),
      };
    });

    return {
      contratoNumero: horario.contrato.numero,
      entidadNombre: horario.contrato.entidad.nombre,
      fechaInicio: formatFechaISO(parseFechaUTC(horario.fechaInicio)),
      fechaFin: formatFechaISO(parseFechaUTC(horario.fechaFin)),
      rangoLabel: formatRangoFechas(horario.fechaInicio, horario.fechaFin),
      anio: horario.anio,
      mes: horario.mes,
      estado: horario.estado,
      fechas,
      puestos: puestosPdf,
      colorPorCodigo: Object.fromEntries(colorPorCodigo),
    };
  }

  // ==================== HELPERS ====================

  private async assertContrato(contratoId: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id: contratoId, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }

  private async assertHorario(id: number, companyId: number) {
    const horario = await this.prisma.cPHorarioMensual.findFirst({
      where: { id, companyId },
    });
    if (!horario) throw new NotFoundException('Horario mensual no encontrado');
    return horario;
  }

  private async assertEditable(id: number, companyId: number) {
    const horario = await this.assertHorario(id, companyId);
    if (horario.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'El horario solo se puede editar en estado Borrador',
      );
    }
    return horario;
  }

  private async assertPuestoDeContrato(puestoId: number, contratoId: number) {
    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id: puestoId, contratoId },
    });
    if (!puesto) {
      throw new BadRequestException(
        'El puesto no pertenece al contrato de este horario',
      );
    }
    return puesto;
  }

  /**
   * Rechaza si el rango [fechaInicio, fechaFin] se cruza con el de CUALQUIER
   * otro horario existente del mismo contrato, sin importar su estado — un
   * horario cubre todo el contrato para ese período, así que no puede haber
   * dos rangos solapados (ver plan).
   */
  private async assertSinSolapamiento(
    contratoId: number,
    fechaInicio: Date,
    fechaFin: Date,
    excludeId?: number,
  ) {
    const existentes = await this.prisma.cPHorarioMensual.findMany({
      where: { contratoId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    for (const otro of existentes) {
      const seSolapa =
        fechaInicio <= otro.fechaFin && fechaFin >= otro.fechaInicio;
      if (seSolapa) {
        throw new BadRequestException(
          `Este rango se solapa con un horario existente (${formatRangoFechas(otro.fechaInicio, otro.fechaFin)}).`,
        );
      }
    }
  }
}
