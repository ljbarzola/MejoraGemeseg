import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AVISOS_CLAVES, personasConCorreo } from '../../common/utils/avisos-correo.util';
import { GmailMailService } from '../mail/gmail-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { hoyEcuador } from '../bitacora/bitacora-fecha.util';
import { OperacionesPendientesService } from './operaciones-pendientes.service';
import {
  ENLACE_RESUMEN_OPERACIONES,
  mensajeDelResumen,
  TITULO_RESUMEN_OPERACIONES,
} from './operaciones-pendientes.util';

/** El día de Ecuador empieza a las 05:00 UTC. */
const MS_EMPIEZA_DIA_ECUADOR = 5 * 60 * 60 * 1000;
const CORREO_REMITENTE = 'sistemas@gemeseg.com';
const NOMBRE_REMITENTE = 'Operaciones GEMESEG';
/** Prefijo fijo del asunto, para que cada persona pueda filtrarlo en su Gmail. */
const PREFIJO_ASUNTO = '[Operaciones GEMESEG]';

export interface ResultadoResumenEmpresa {
  companyId: number;
  destinatarios: number;
  /** Notificaciones en la app dejadas (0 en simulación o si hoy no hay nada). */
  avisos: number;
  /** Correos enviados: solo a quien lo pidió en su Perfil. */
  correos: number;
  /** Lo que diría el aviso (null si hoy no hay nada pendiente). */
  mensaje: string | null;
}

/**
 * Resumen diario de Operaciones: UNA notificación en la app por persona, con un renglón por cada
 * tema pendiente (ver operaciones-pendientes.util.ts). Si no hay nada, no se manda nada.
 * El correo es solo para quien lo pidió en su Perfil (`notificaciones:operaciones-resumen`
 * = `['correo']`); sin esa preferencia, NUNCA sale correo.
 */
@Injectable()
export class OperacionesResumenService {
  private readonly logger = new Logger(OperacionesResumenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pendientes: OperacionesPendientesService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly mail: GmailMailService,
  ) {}

  /** Empresas que usan Operaciones: con algún contrato o con inventario cargado. */
  private async empresasConOperaciones(): Promise<number[]> {
    const [contratos, articulos] = await Promise.all([
      this.prisma.cPContrato.findMany({ distinct: ['companyId'], select: { companyId: true } }),
      this.prisma.invArticulo.findMany({ distinct: ['companyId'], select: { companyId: true } }),
    ]);
    return [...new Set([...contratos, ...articulos].map((f) => f.companyId))].sort((a, b) => a - b);
  }

  async procesar(
    opciones: { dryRun?: boolean; ahora?: Date } = {},
  ): Promise<{ fecha: string; empresas: ResultadoResumenEmpresa[] }> {
    const ahora = opciones.ahora ?? new Date();
    const fecha = hoyEcuador(ahora);
    const resultados: ResultadoResumenEmpresa[] = [];
    for (const companyId of await this.empresasConOperaciones()) {
      try {
        resultados.push(await this.procesarEmpresa(companyId, fecha, opciones.dryRun === true));
      } catch (err) {
        // Un fallo en una empresa no debe impedir revisar las demás.
        this.logger.error(`Resumen de Operaciones: falló la empresa ${companyId}: ${(err as Error).message}`);
      }
    }
    return { fecha, empresas: resultados };
  }

  private async procesarEmpresa(
    companyId: number,
    fecha: string,
    dryRun: boolean,
  ): Promise<ResultadoResumenEmpresa> {
    const pendientes = await this.pendientes.obtener(companyId, fecha);
    const mensaje = mensajeDelResumen(pendientes);
    const destinatarios = await this.permissions.getCompanyUserIdsWithWriteAccess(companyId, 'OPERACIONES');
    const resultado: ResultadoResumenEmpresa = {
      companyId,
      destinatarios: destinatarios.length,
      avisos: 0,
      correos: 0,
      mensaje,
    };
    if (!mensaje || dryRun || destinatarios.length === 0) return resultado;

    // Repetir la corrida el mismo día (reintento de Cloud Scheduler) no duplica el aviso ni el correo.
    const desde = new Date(Date.parse(`${fecha}T00:00:00Z`) + MS_EMPIEZA_DIA_ECUADOR);
    const avisados: number[] = [];
    for (const userId of destinatarios) {
      const yaAvisada = await this.prisma.notification.findFirst({
        where: { userId, companyId, title: TITULO_RESUMEN_OPERACIONES, createdAt: { gte: desde } },
        select: { id: true },
      });
      if (yaAvisada) continue;
      try {
        await this.notifications.create({
          userId,
          companyId,
          title: TITULO_RESUMEN_OPERACIONES,
          message: mensaje,
          link: ENLACE_RESUMEN_OPERACIONES,
        });
        resultado.avisos++;
        avisados.push(userId);
      } catch (err) {
        this.logger.warn(`No se pudo avisar al usuario ${userId}: ${(err as Error).message}`);
      }
    }
    resultado.correos = await this.enviarCorreos(avisados, mensaje);
    return resultado;
  }

  /** Correo SOLO a quien lo pidió. Si no hay nadie que lo haya pedido, no se toca el servicio de correo. */
  private async enviarCorreos(userIds: number[], mensaje: string): Promise<number> {
    const conCorreo = await personasConCorreo(this.prisma, userIds, AVISOS_CLAVES.OPERACIONES);
    if (conCorreo.size === 0) return 0;
    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: [...conCorreo] } },
      select: { id: true, email: true, fullName: true },
    });
    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    let enviados = 0;
    for (const u of usuarios) {
      try {
        await this.mail.sendMail({
          to: u.email,
          subject: `${PREFIJO_ASUNTO} ${TITULO_RESUMEN_OPERACIONES}`,
          bodyText: `Hola ${u.fullName},\n\n${mensaje}\n\nPuedes verlo aquí: ${base}${ENLACE_RESUMEN_OPERACIONES}\n\nEste es un aviso automático del sistema de Gemeseg. Si prefieres recibirlo solo en las notificaciones de la app (sin correo), cámbialo en tu Perfil: ${base}/profile`,
          from: CORREO_REMITENTE,
          fromName: NOMBRE_REMITENTE,
        });
        enviados++;
      } catch (err) {
        this.logger.warn(`No se pudo enviar el correo a ${u.email}: ${(err as Error).message}`);
      }
    }
    return enviados;
  }
}
