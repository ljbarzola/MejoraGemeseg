import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  diasEntre,
  formatoFecha,
  hoyEcuador,
} from '../contratacion-publica/entregas/entregas.util';
import { cuandoVence, diaDeVencimiento, tocaEnviar } from './task-reminders.util';

const CORREO_REMITENTE_TAREAS = 'sistemas@gemeseg.com';
const NOMBRE_REMITENTE_TAREAS = 'Tareas GEMESEG';

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
  destinatarios?: { email: string; tareas: AvisoTarea[] }[];
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

    if (opciones.dryRun) {
      return {
        recordatorios: tocan.length,
        personas: porPersona.size,
        destinatarios: [...porPersona.values()].map((p) => ({
          email: p.usuario.email,
          tareas: [...p.tareas.values()],
        })),
      };
    }

    // Un recordatorio se da por enviado si le llegó (correo o campanita) a al
    // menos un asignado; si no le llegó a nadie, se reintenta en la próxima corrida.
    const entregados = new Set<number>();
    for (const [userId, p] of porPersona) {
      const tareas = [...p.tareas.values()];
      const llego = await this.avisar(userId, p.usuario, tareas);
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

  /** Campanita + correo para una persona. Devuelve true si llegó por algún canal. */
  private async avisar(
    userId: number,
    usuario: { email: string; fullName: string; companyId: number | null },
    tareas: AvisoTarea[],
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

    // Sin empresa (super administrador) no hay campanita: solo correo.
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

    try {
      const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      await this.mail.sendMail({
        to: usuario.email,
        subject: `${titulo} — GEMESEG`,
        bodyText: `Hola ${usuario.fullName},\n\n${
          unica ? mensaje : `Tienes ${tareas.length} tareas con recordatorio:\n\n${lineas.join('\n')}`
        }\n\nPuedes verlo aquí: ${base}${link}\n\nEste es un aviso automático del sistema de Gemeseg.`,
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
