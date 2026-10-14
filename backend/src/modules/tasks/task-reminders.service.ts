import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  diasEntre,
  formatoFecha,
  hoyEcuador,
} from '../contratacion-publica/entregas/entregas.util';
import {
  cuandoVence,
  diaDeVencimiento,
  PREFERENCIA_RECORDATORIOS_TAREAS,
  quiereCorreo,
  tocaEnviar,
} from './task-reminders.util';

const CORREO_REMITENTE_TAREAS = 'sistemas@gemeseg.com';
const NOMBRE_REMITENTE_TAREAS = 'Tareas GEMESEG';
/**
 * Prefijo fijo del asunto: permite que cada persona cree en su Gmail un filtro
 * («asunto: [Tareas GEMESEG]» → etiqueta y sin pasar por la bandeja de entrada).
 * No cambiarlo sin avisar: rompería esos filtros.
 */
const PREFIJO_ASUNTO_TAREAS = '[Tareas GEMESEG]';

export interface AvisoTarea {
  taskId: number;
  titulo: string;
  proyecto: string;
  texto: string;
}

export interface ResultadoRecordatoriosTareas {
  recordatorios: number;
  personas: number;
  /** Solo con dryRun: a quién se avisaría y de qué (no se envía nada). */
  destinatarios?: { email: string; correo: boolean; tareas: AvisoTarea[] }[];
}

/**
 * Recordatorios de tareas: cada tarea guarda qué días antes de su fecha fin
 * debe avisar (TaskReminder). Lo dispara Cloud Scheduler una vez al día (ver
 * TaskRemindersCronController); si ese día no toca ningún recordatorio, no se
 * envía nada. Cada persona asignada recibe UN correo y UNA notificación con
 * todas sus tareas del día.
 */
@Injectable()
export class TaskRemindersService {
  private readonly logger = new Logger(TaskRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: GmailMailService,
    private readonly notifications: NotificationsService,
  ) {}

  async procesar(
    opciones: { dryRun?: boolean; ahora?: Date } = {},
  ): Promise<ResultadoRecordatoriosTareas> {
    const hoy = hoyEcuador(opciones.ahora ?? new Date());

    const candidatos = await this.prisma.taskReminder.findMany({
      where: {
        sentAt: null,
        task: {
          status: { notIn: ['DONE', 'CANCELLED'] },
          endDate: { not: null },
          assignees: { some: {} },
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            endDate: true,
            project: { select: { name: true } },
            assignees: {
              select: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    isActive: true,
                    companyId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const tocan = candidatos.filter((r) => tocaEnviar(r, r.task, hoy));
    if (tocan.length === 0) return { recordatorios: 0, personas: 0 };

    // Una persona recibe un solo aviso con todas sus tareas de hoy (una tarea
    // aparece una sola vez aunque coincidan dos de sus recordatorios).
    const porPersona = new Map<
      number,
      {
        usuario: { email: string; fullName: string; companyId: number | null };
        tareas: Map<number, AvisoTarea>;
        reminderIds: Set<number>;
      }
    >();
    for (const r of tocan) {
      const faltan = diasEntre(hoy, diaDeVencimiento(r.task.endDate as Date));
      const aviso: AvisoTarea = {
        taskId: r.task.id,
        titulo: r.task.title,
        proyecto: r.task.project.name,
        texto: cuandoVence(
          faltan,
          formatoFecha(diaDeVencimiento(r.task.endDate as Date)),
        ),
      };
      for (const { user } of r.task.assignees) {
        if (!user.isActive) continue;
        const entrada = porPersona.get(user.id) ?? {
          usuario: user,
          tareas: new Map<number, AvisoTarea>(),
          reminderIds: new Set<number>(),
        };
        entrada.tareas.set(aviso.taskId, aviso);
        entrada.reminderIds.add(r.id);
        porPersona.set(user.id, entrada);
      }
    }

    // Quien eligió «solo notificaciones en la app» en su Perfil no recibe correo.
    const sinCorreo = await this.personasSinCorreo([...porPersona.keys()]);

    if (opciones.dryRun) {
      return {
        recordatorios: tocan.length,
        personas: porPersona.size,
        destinatarios: [...porPersona.entries()].map(([userId, p]) => ({
          email: p.usuario.email,
          correo: !sinCorreo.has(userId),
          tareas: [...p.tareas.values()],
        })),
      };
    }

    // Un recordatorio se da por enviado si le llegó (correo o notificación) a al
    // menos un asignado; si no le llegó a nadie, se reintenta en la próxima corrida.
    const entregados = new Set<number>();
    for (const [userId, p] of porPersona) {
      const tareas = [...p.tareas.values()];
      const llego = await this.avisar(
        userId,
        p.usuario,
        tareas,
        !sinCorreo.has(userId),
      );
      if (llego) p.reminderIds.forEach((id) => entregados.add(id));
    }

    if (entregados.size > 0) {
      await this.prisma.taskReminder.updateMany({
        where: { id: { in: [...entregados] } },
        data: { sentAt: new Date() },
      });
    }
    this.logger.log(
      `Recordatorios de tareas: ${entregados.size} de ${tocan.length} enviado(s), ${porPersona.size} persona(s).`,
    );
    return { recordatorios: entregados.size, personas: porPersona.size };
  }

  /**
   * Personas, de entre `userIds`, que pidieron los recordatorios solo en la
   * notificaciones (sin correo). Si la consulta falla se asume que todas quieren correo: es peor
   * quedarse sin avisar que mandar un correo de más.
   */
  private async personasSinCorreo(userIds: number[]): Promise<Set<number>> {
    try {
      const filas = await this.prisma.userPreference.findMany({
        where: {
          key: PREFERENCIA_RECORDATORIOS_TAREAS,
          userId: { in: userIds },
        },
        select: { userId: true, value: true },
      });
      return new Set(
        filas.filter((f) => !quiereCorreo(f.value)).map((f) => f.userId),
      );
    } catch (err) {
      this.logger.warn(
        `No se pudieron leer las preferencias de aviso: ${(err as Error).message}`,
      );
      return new Set();
    }
  }

  /**
   * Notificación (y correo, si la persona no pidió lo contrario) para una persona.
   * Devuelve true si el aviso quedó resuelto: llegó por algún canal, o la
   * persona eligió no recibirlo por el único canal que tenía.
   */
  private async avisar(
    userId: number,
    usuario: { email: string; fullName: string; companyId: number | null },
    tareas: AvisoTarea[],
    porCorreo: boolean,
  ): Promise<boolean> {
    const lineas = tareas.map(
      (t) => `• "${t.titulo}" — ${t.proyecto}: ${t.texto}`,
    );
    const unica = tareas.length === 1;
    const titulo = unica
      ? 'Recordatorio de tarea'
      : `Recordatorio: ${tareas.length} tareas`;
    const mensaje = unica
      ? `"${tareas[0].titulo}" (${tareas[0].proyecto}) ${tareas[0].texto}`
      : `Tienes ${tareas.length} tareas con recordatorio:\n${lineas.join('\n')}`;
    const link = unica ? `/tasks/${tareas[0].taskId}` : '/';
    let llego = false;

    // Sin empresa (super administrador) no hay notificación en la plataforma: solo correo.
    if (usuario.companyId != null) {
      try {
        await this.notifications.create({
          userId,
          companyId: usuario.companyId,
          title: titulo,
          message: mensaje,
          link,
        });
        llego = true;
      } catch (err) {
        this.logger.warn(
          `No se pudo crear la notificación para el usuario ${userId}: ${(err as Error).message}`,
        );
      }
    }

    // Sin notificación posible (super administrador) y sin correo por decisión de
    // la persona, no hay nada que enviar: se da por resuelto para no reintentar
    // todos los días.
    if (!porCorreo) return usuario.companyId == null ? true : llego;

    try {
      const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      await this.mail.sendMail({
        to: usuario.email,
        subject: `${PREFIJO_ASUNTO_TAREAS} ${titulo}`,
        bodyText: `Hola ${usuario.fullName},\n\n${
          unica
            ? mensaje
            : `Tienes ${tareas.length} tareas con recordatorio:\n\n${lineas.join('\n')}`
        }\n\nPuedes verlo aquí: ${base}${link}\n\nEste es un aviso automático del sistema de Gemeseg. Si prefieres recibir estos recordatorios solo en las notificaciones de la app (sin correo), cámbialo en tu Perfil: ${base}/profile`,
        from: CORREO_REMITENTE_TAREAS,
        fromName: NOMBRE_REMITENTE_TAREAS,
      });
      llego = true;
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar el correo a ${usuario.email}: ${(err as Error).message}`,
      );
    }
    return llego;
  }
}
