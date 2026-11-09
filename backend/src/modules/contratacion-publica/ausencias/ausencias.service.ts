import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PermissionsService } from '../../permissions/permissions.service';
import type { CodigoTurnoInfo } from '../bitacoras/bitacora-revisor.util';
import { diaAnterior, sugerirReemplazos } from '../bitacoras/reemplazo-sugerido.util';
import {
  conflictoReemplazo,
  diaLegible,
  fechaNoPermitida,
  MOTIVO_LABEL,
} from './ausencias.util';
import {
  AnularAusenciaDto,
  CrearAusenciaDto,
  CubrirAusenciaDto,
  ListarAusenciasQueryDto,
} from './dto/ausencias.dto';

export interface ActorAusencia {
  userId: number;
  companyId: number;
  nombre: string;
}

const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aISO = (d: Date) => d.toISOString().slice(0, 10);
/** Hoy en Ecuador (UTC-5, sin horario de verano). */
const hoyEcuador = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const limpiar = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

@Injectable()
export class AusenciasService {
  private readonly logger = new Logger(AusenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  private vista(a: {
    id: number;
    puestoId: number;
    puestoNombre: string;
    contratoNumero: string;
    entidadNombre: string;
    fecha: Date;
    cedula: string;
    guardiaNombre: string;
    motivo: string;
    hora: string | null;
    nota: string | null;
    estado: string;
    reemplazoCedula: string | null;
    reemplazoNombre: string | null;
    anulacionNota: string | null;
    registradaPorNombre: string;
    createdAt: Date;
  }) {
    return {
      id: a.id,
      puestoId: a.puestoId,
      puestoNombre: a.puestoNombre,
      contratoNumero: a.contratoNumero,
      entidadNombre: a.entidadNombre,
      fecha: aISO(a.fecha),
      cedula: a.cedula,
      guardiaNombre: a.guardiaNombre,
      motivo: a.motivo,
      hora: a.hora,
      nota: a.nota,
      estado: a.estado,
      reemplazoCedula: a.reemplazoCedula,
      reemplazoNombre: a.reemplazoNombre,
      anulacionNota: a.anulacionNota,
      registradaPorNombre: a.registradaPorNombre,
      createdAt: a.createdAt,
    };
  }

  async listar(companyId: number, q: ListarAusenciasQueryDto) {
    const hasta = q.hasta ?? hoyEcuador();
    const desde = q.desde ?? aISO(new Date(aFecha(hasta).getTime() - 29 * 86_400_000));
    const filas = await this.prisma.cPAusencia.findMany({
      where: {
        companyId,
        fecha: { gte: aFecha(desde), lte: aFecha(hasta) },
        ...(q.estado ? { estado: q.estado } : { estado: { not: 'ANULADA' } }),
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    return filas.map((a) => this.vista(a));
  }

  /** Datos del contrato de un puesto para un día: guardias, turnos y códigos. */
  private async datosDelDia(companyId: number, contratoId: number, fecha: string) {
    const ayer = diaAnterior(fecha);
    const [puestos, celdas, codigos, ausencias] = await Promise.all([
      this.prisma.cPPuestoServicio.findMany({
        where: { contratoId, companyId },
        select: { id: true, nombre: true, guardias: { select: { cedula: true, nombreGuardia: true } } },
      }),
      this.prisma.cPHorarioCelda.findMany({
        where: { fecha: { in: [aFecha(fecha), aFecha(ayer)] }, horario: { contratoId, companyId } },
        select: { puestoId: true, fecha: true, cedula: true, codigoTurno: true },
      }),
      this.prisma.cPCodigoTurno.findMany({ where: { companyId } }),
      this.prisma.cPAusencia.findMany({
        where: { companyId, contratoId, fecha: aFecha(fecha), estado: { not: 'ANULADA' } },
        select: { cedula: true, reemplazoCedula: true, estado: true },
      }),
    ]);
    const codigosPorCodigo: Record<string, CodigoTurnoInfo> = {};
    for (const c of codigos) {
      codigosPorCodigo[c.codigo] = { nombre: c.nombre, esDescanso: c.esDescanso, horaInicio: c.horaInicio, horaFin: c.horaFin };
    }
    return { puestos, celdas, codigosPorCodigo, ausencias };
  }

  /** Quién podría cubrir a un guardia ese día (la misma regla de las bitácoras; solo sugiere). */
  async sugerencias(companyId: number, puestoId: number, cedula: string, fecha?: string) {
    const dia = fecha ?? hoyEcuador();
    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id: puestoId, companyId },
      select: { contratoId: true },
    });
    if (!puesto) throw new NotFoundException('Puesto no encontrado.');
    const d = await this.datosDelDia(companyId, puesto.contratoId, dia);
    const guardias = d.puestos.flatMap((p) =>
      p.guardias.map((g) => ({ cedula: g.cedula, nombre: g.nombreGuardia, puestoId: p.id, puestoNombre: p.nombre })),
    );
    // Quien ya faltó o ya cubre a otro ese día no se propone (como quien ya está trabajando en una hoja).
    const ocupados = d.ausencias.flatMap((a) => [a.cedula, ...(a.reemplazoCedula && a.estado === 'CUBIERTA' ? [a.reemplazoCedula] : [])]);
    return sugerirReemplazos({
      fecha: dia,
      puestoId,
      ausenteCedula: cedula,
      guardias,
      celdas: d.celdas.map((c) => ({ fecha: aISO(c.fecha), cedula: c.cedula, codigo: c.codigoTurno })),
      codigos: d.codigosPorCodigo,
      presentes: ocupados,
    });
  }

  private async validarReemplazo(
    companyId: number,
    contratoId: number,
    fecha: string,
    ausenteCedula: string,
    reemplazoCedula: string,
    ignorarAusenciaId?: number,
  ) {
    const d = await this.datosDelDia(companyId, contratoId, fecha);
    const trabajando = new Set(
      d.celdas
        .filter((c) => aISO(c.fecha) === fecha && !d.codigosPorCodigo[c.codigoTurno]?.esDescanso)
        .map((c) => c.cedula),
    );
    const otras = ignorarAusenciaId
      ? await this.prisma.cPAusencia.findMany({
          where: { companyId, contratoId, fecha: aFecha(fecha), estado: { not: 'ANULADA' }, id: { not: ignorarAusenciaId } },
          select: { cedula: true, reemplazoCedula: true, estado: true },
        })
      : d.ausencias;
    const motivo = conflictoReemplazo({
      reemplazoCedula,
      ausenteCedula,
      trabajando,
      ausentes: new Set(otras.map((a) => a.cedula)),
      cubriendo: new Set(otras.filter((a) => a.estado === 'CUBIERTA' && a.reemplazoCedula).map((a) => a.reemplazoCedula as string)),
    });
    if (motivo) throw new BadRequestException(motivo);
  }

  async crear(actor: ActorAusencia, dto: CrearAusenciaDto) {
    const hoy = hoyEcuador();
    const fecha = dto.fecha ?? hoy;
    const fuera = fechaNoPermitida(fecha, hoy);
    if (fuera) throw new BadRequestException(fuera);

    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id: dto.puestoId, companyId: actor.companyId },
      select: {
        id: true,
        nombre: true,
        contratoId: true,
        contrato: { select: { numero: true, entidad: { select: { nombre: true } } } },
      },
    });
    if (!puesto) throw new NotFoundException('Puesto no encontrado.');

    // Solo se registra la falta de quien debía trabajar ese día en este puesto según el horario.
    const celda = await this.prisma.cPHorarioCelda.findFirst({
      where: { puestoId: puesto.id, cedula: dto.cedula, fecha: aFecha(fecha), horario: { companyId: actor.companyId } },
      select: { nombreGuardia: true, codigoTurno: true },
    });
    if (!celda) throw new BadRequestException('Ese guardia no tenía turno en este puesto ese día según el horario.');
    const codigo = await this.prisma.cPCodigoTurno.findFirst({
      where: { companyId: actor.companyId, codigo: celda.codigoTurno },
      select: { esDescanso: true },
    });
    if (codigo?.esDescanso) throw new BadRequestException('Ese guardia tenía descanso ese día: no había turno que faltar.');

    const repetida = await this.prisma.cPAusencia.findFirst({
      where: { companyId: actor.companyId, puestoId: puesto.id, cedula: dto.cedula, fecha: aFecha(fecha), estado: { not: 'ANULADA' } },
      select: { id: true },
    });
    if (repetida) throw new BadRequestException('Esa falta ya está registrada.');

    const reemplazoCedula = limpiar(dto.reemplazoCedula);
    const reemplazoNombre = limpiar(dto.reemplazoNombre);
    if (reemplazoCedula) {
      if (!reemplazoNombre) throw new BadRequestException('Falta el nombre de quien cubre.');
      await this.validarReemplazo(actor.companyId, puesto.contratoId, fecha, dto.cedula, reemplazoCedula);
    }

    const creada = await this.prisma.cPAusencia.create({
      data: {
        companyId: actor.companyId,
        puestoId: puesto.id,
        puestoNombre: puesto.nombre,
        contratoId: puesto.contratoId,
        contratoNumero: puesto.contrato.numero,
        entidadNombre: puesto.contrato.entidad.nombre,
        fecha: aFecha(fecha),
        cedula: dto.cedula,
        guardiaNombre: celda.nombreGuardia,
        motivo: dto.motivo,
        hora: limpiar(dto.hora),
        nota: limpiar(dto.nota),
        estado: reemplazoCedula ? 'CUBIERTA' : 'POR_CUBRIR',
        reemplazoCedula,
        reemplazoNombre: reemplazoCedula ? reemplazoNombre : null,
        registradaPorId: actor.userId,
        registradaPorNombre: actor.nombre,
      },
    });
    await this.avisar(actor, creada);
    return this.vista(creada);
  }

  async cubrir(actor: ActorAusencia, id: number, dto: CubrirAusenciaDto) {
    const a = await this.prisma.cPAusencia.findFirst({ where: { id, companyId: actor.companyId } });
    if (!a) throw new NotFoundException('Falta no encontrada.');
    if (a.estado === 'ANULADA') throw new BadRequestException('Esta falta fue anulada.');
    const cedula = dto.reemplazoCedula.trim();
    const nombre = dto.reemplazoNombre.trim();
    if (!cedula || !nombre) throw new BadRequestException('Elige quién cubre.');
    await this.validarReemplazo(actor.companyId, a.contratoId, aISO(a.fecha), a.cedula, cedula, a.id);
    const actualizada = await this.prisma.cPAusencia.update({
      where: { id },
      data: { estado: 'CUBIERTA', reemplazoCedula: cedula, reemplazoNombre: nombre },
    });
    return this.vista(actualizada);
  }

  /** Quita la falta (se registró por error o ya no aplica). Queda anulada, no se borra. */
  async anular(actor: ActorAusencia, id: number, dto: AnularAusenciaDto) {
    const a = await this.prisma.cPAusencia.findFirst({ where: { id, companyId: actor.companyId } });
    if (!a) throw new NotFoundException('Falta no encontrada.');
    if (a.estado === 'ANULADA') return this.vista(a);
    const actualizada = await this.prisma.cPAusencia.update({
      where: { id },
      data: { estado: 'ANULADA', anulacionNota: limpiar(dto.nota) },
    });
    return this.vista(actualizada);
  }

  /** Aviso por la campana. Si falla, la falta ya quedó guardada: solo se registra. */
  private async avisar(
    actor: ActorAusencia,
    a: {
      id: number;
      puestoNombre: string;
      entidadNombre: string;
      fecha: Date;
      guardiaNombre: string;
      motivo: string;
      reemplazoNombre: string | null;
    },
  ) {
    try {
      const destinatarios = (
        await this.permissions.getCompanyUserIdsWithWriteAccess(actor.companyId, 'OPERACIONES')
      ).filter((u) => u !== actor.userId);
      if (destinatarios.length === 0) return;
      const message =
        `${a.guardiaNombre} no llegó a ${a.puestoNombre} (${a.entidadNombre}) el ${diaLegible(aISO(a.fecha))} ` +
        `(${MOTIVO_LABEL[a.motivo] ?? a.motivo}). ` +
        (a.reemplazoNombre ? `Lo cubre ${a.reemplazoNombre}.` : 'Falta quien lo cubra.');
      for (const userId of destinatarios) {
        await this.notifications.create({
          userId,
          companyId: actor.companyId,
          title: 'Guardia que no llegó',
          message,
          link: '/operaciones',
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar de la falta ${a.id}: ${(err as Error).message}`);
    }
  }
}
