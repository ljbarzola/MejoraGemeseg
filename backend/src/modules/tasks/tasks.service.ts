import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserRole } from '@prisma/client';
import { TASK_REMINDER_DDL } from './task-reminder.schema';
import {
  normalizarRecordatorios,
  RECORDATORIOS_POR_DEFECTO,
} from './task-reminders.util';
import { textoDesdeFecha } from '../contratacion-publica/entregas/entregas.util';
import { NotificationsService } from '../notifications/notifications.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import {
  AVISOS_CLAVES,
  personasConCorreo,
} from '../../common/utils/avisos-correo.util';

/** Quién pide la operación (viene del token). */
export interface ActorTarea {
  userId: number;
  role: UserRole;
  companyId: number | null;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En progreso',
  IN_REVIEW: 'En revisión',
  DONE: 'Hecha',
  CANCELLED: 'Cancelada',
};

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: GmailMailService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of TASK_REMINDER_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla TaskReminder: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Deja los recordatorios de la tarea como los pidió el formulario.
   * - Sin fecha fin no hay recordatorios.
   * - Si cambió la fecha fin, los avisos ya enviados vuelven a quedar pendientes
   *   (contra la fecha nueva).
   * - Si no se mandó la lista y la tarea acaba de recibir fecha, queda el aviso
   *   por defecto (1 día antes).
   */
  private async sincronizarRecordatorios(
    taskId: number,
    opciones: {
      dias: number[] | undefined;
      tieneFecha: boolean;
      fechaCambio: boolean;
      teniaFecha: boolean;
    },
  ) {
    if (!opciones.tieneFecha) {
      await this.prisma.taskReminder.deleteMany({ where: { taskId } });
      return;
    }
    let deseados = opciones.dias;
    if (deseados === undefined && !opciones.teniaFecha) {
      deseados = RECORDATORIOS_POR_DEFECTO;
    }
    if (opciones.fechaCambio) {
      await this.prisma.taskReminder.updateMany({
        where: { taskId },
        data: { sentAt: null },
      });
    }
    if (deseados === undefined) return;

    const dias = normalizarRecordatorios(deseados);
    await this.prisma.taskReminder.deleteMany({
      where: { taskId, daysBefore: { notIn: dias } },
    });
    if (dias.length > 0) {
      await this.prisma.taskReminder.createMany({
        data: dias.map((daysBefore) => ({ taskId, daysBefore })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * Una tarea «Sin proyecto» solo la ven y gestionan quien la creó, sus asignados
   * y un administrador de la misma empresa que quien la creó (o el super admin).
   */
  private async puedeGestionarSinProyecto(
    task: { createdById: number | null; assignees: { userId: number }[] },
    actor: ActorTarea,
  ): Promise<boolean> {
    if (task.createdById === actor.userId) return true;
    if (task.assignees.some((a) => a.userId === actor.userId)) return true;
    if (actor.role !== UserRole.ADMIN) return false;
    if (actor.companyId == null) return true;
    if (task.createdById == null) return false;
    const creador = await this.prisma.user.findUnique({
      where: { id: task.createdById },
      select: { companyId: true },
    });
    return creador?.companyId === actor.companyId;
  }

  /** Avisa en la app a las personas indicadas (nunca a quien hizo el cambio). Un fallo no corta la operación. */
  private async avisar(
    userIds: number[],
    actorId: number,
    title: string,
    message: string,
    taskId: number | null,
  ) {
    const destinos = [...new Set(userIds)].filter((id) => id !== actorId);
    if (destinos.length === 0) return;
    try {
      const usuarios = await this.prisma.user.findMany({
        where: { id: { in: destinos }, isActive: true },
        select: { id: true, companyId: true, email: true, fullName: true },
      });
      // Correo solo a quien lo pidió en su Perfil (por defecto, solo la notificación en la app).
      const conCorreo = await personasConCorreo(
        this.prisma,
        usuarios.map((u) => u.id),
        AVISOS_CLAVES.TAREAS,
      );
      const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      for (const u of usuarios) {
        if (conCorreo.has(u.id) && u.email) {
          try {
            await this.mail.sendMail({
              to: u.email,
              subject: `[Tareas GEMESEG] ${title}`,
              bodyText: `Hola ${u.fullName},\n\n${message}\n\nPuedes verla aquí: ${base}${taskId ? `/tasks/${taskId}` : ''}\n\nEste es un aviso automático del sistema de Gemeseg. Si prefieres recibirlo solo en las notificaciones de la app, cámbialo en tu Perfil: ${base}/profile`,
              from: 'sistemas@gemeseg.com',
              fromName: 'Tareas GEMESEG',
            });
          } catch (err) {
            this.logger.warn(
              `No se pudo enviar el correo a ${u.email}: ${(err as Error).message}`,
            );
          }
        }
        if (u.companyId == null) continue; // sin empresa no hay bandeja de notificaciones
        await this.notifications.create({
          userId: u.id,
          companyId: u.companyId,
          title,
          message,
          link: taskId ? `/tasks/${taskId}` : '/',
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar la notificación de la tarea ${taskId ?? ''}: ${(err as Error).message}`,
      );
    }
  }

  /** Solo se puede asignar a gente de la misma empresa (en tareas sin proyecto no hay equipo que filtre). */
  private async validarAsignados(ids: number[], companyId: number | null) {
    if (ids.length === 0) return;
    const validos = await this.prisma.user.count({
      where: { id: { in: ids }, companyId: companyId ?? null, isActive: true },
    });
    if (validos !== new Set(ids).size) {
      throw new ForbiddenException(
        'Solo puedes asignar tareas a personas activas de tu empresa',
      );
    }
  }

  /** La fecha fin no puede ir antes que la de inicio (AAAA-MM-DD). */
  private validarFechas(inicio?: string | null, fin?: string | null) {
    if (inicio && fin && fin.slice(0, 10) < inicio.slice(0, 10)) {
      throw new BadRequestException(
        'La fecha fin no puede ser anterior a la fecha de inicio.',
      );
    }
  }

  private assigneeSelect = {
    select: { id: true, fullName: true, email: true },
  };

  async findByProject(projectId: number) {
    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignees: {
          select: { user: this.assigneeSelect },
        },
      },
    });
  }

  async findOne(id: number, actor?: ActorTarea) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: {
          select: { userId: true, user: this.assigneeSelect },
        },
        project: {
          select: { id: true, name: true },
        },
        reminders: { select: { daysBefore: true } },
      },
    });

    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    if (
      task.projectId == null &&
      (!actor || !(await this.puedeGestionarSinProyecto(task, actor)))
    ) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    const { reminders, ...resto } = task;
    return {
      ...resto,
      reminderDays: reminders
        .map((r) => r.daysBefore)
        .sort((a, b) => b - a),
    };
  }

  async create(
    projectId: number | null,
    dto: CreateTaskDto,
    userId: number,
    userRole: UserRole,
    companyId: number | null = null,
  ) {
    const assigneeIds = dto.assigneeIds || [];
    this.validarFechas(dto.startDate, dto.endDate);

    if (projectId == null) {
      await this.validarAsignados(assigneeIds, companyId);
    } else {
      const membership = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId, userId },
        },
      });

      if (!membership) {
        throw new ForbiddenException('No eres miembro de este proyecto');
      }

      if ((membership.role as string) === 'VIEWER') {
        throw new ForbiddenException('Los observadores no pueden crear tareas');
      }
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: (dto.priority as any) || 'MEDIUM',
        status: (dto.status as any) || 'TODO',
        startDate: dto.startDate
          ? new Date(dto.startDate + 'T12:00:00.000Z')
          : null,
        endDate: dto.endDate ? new Date(dto.endDate + 'T12:00:00.000Z') : null,
        estimatedHours: dto.estimatedHours ?? 0,
        projectId,
        createdById: userId,
        assignees:
          assigneeIds.length > 0
            ? { create: assigneeIds.map((userId) => ({ userId })) }
            : undefined,
      },
      include: {
        assignees: {
          select: { user: this.assigneeSelect },
        },
      },
    });

    await this.sincronizarRecordatorios(task.id, {
      dias: dto.reminderDays,
      tieneFecha: !!task.endDate,
      fechaCambio: false,
      teniaFecha: false,
    });

    await this.avisar(
      assigneeIds,
      userId,
      'Te asignaron una tarea',
      `Te asignaron la tarea "${task.title}".`,
      task.id,
    );

    return task;
  }

  async update(
    id: number,
    dto: UpdateTaskDto,
    userId: number,
    userRole: UserRole,
    companyId: number | null = null,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: { select: { userId: true } },
        project: {
          select: {
            id: true,
            members: {
              where: { userId },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    if (task.projectId == null) {
      const actor = { userId, role: userRole, companyId };
      if (!(await this.puedeGestionarSinProyecto(task, actor))) {
        throw new ForbiddenException('No puedes editar esta tarea');
      }
    } else {
      const membership = task.project?.members[0];

      if (!membership && userRole !== UserRole.ADMIN) {
        throw new ForbiddenException('No eres miembro de este proyecto');
      }

      if (
        membership?.role === ('VIEWER' as any) &&
        userRole !== UserRole.ADMIN
      ) {
        throw new ForbiddenException(
          'Los observadores no pueden editar tareas',
        );
      }
    }

    this.validarFechas(
      dto.startDate !== undefined
        ? dto.startDate
        : task.startDate
          ? textoDesdeFecha(task.startDate)
          : null,
      dto.endDate !== undefined
        ? dto.endDate
        : task.endDate
          ? textoDesdeFecha(task.endDate)
          : null,
    );

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate
        ? new Date(dto.startDate + 'T12:00:00.000Z')
        : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate
        ? new Date(dto.endDate + 'T12:00:00.000Z')
        : null;
    if (dto.estimatedHours !== undefined)
      data.estimatedHours = dto.estimatedHours;

    if (dto.assigneeIds !== undefined) {
      if (task.projectId == null)
        await this.validarAsignados(dto.assigneeIds, companyId);
      await this.prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (dto.assigneeIds.length > 0) {
        data.assignees = {
          create: dto.assigneeIds.map((userId) => ({ userId })),
        };
      }
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: {
        assignees: {
          select: { user: this.assigneeSelect },
        },
      },
    });

    if (dto.endDate !== undefined || dto.reminderDays !== undefined) {
      const fechaAntes = task.endDate ? textoDesdeFecha(task.endDate) : null;
      const fechaAhora = updated.endDate
        ? textoDesdeFecha(updated.endDate)
        : null;
      await this.sincronizarRecordatorios(id, {
        dias: dto.reminderDays,
        tieneFecha: !!updated.endDate,
        fechaCambio: fechaAntes !== fechaAhora,
        teniaFecha: !!task.endDate,
      });
    }

    // Avisos: a los recién asignados, y a los que ya estaban si cambió algo de la tarea.
    const antes = new Set(task.assignees.map((a) => a.userId));
    const ahora = (dto.assigneeIds ?? [...antes]) as number[];
    const nuevos = ahora.filter((u) => !antes.has(u));
    await this.avisar(
      nuevos,
      userId,
      'Te asignaron una tarea',
      `Te asignaron la tarea "${updated.title}".`,
      id,
    );
    const siguen = ahora.filter((u) => antes.has(u));
    if (dto.status !== undefined && dto.status !== task.status) {
      await this.avisar(
        siguen,
        userId,
        'Cambió el estado de una tarea',
        `La tarea "${updated.title}" pasó a ${ETIQUETA_ESTADO[dto.status] ?? dto.status}.`,
        id,
      );
    } else if (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.priority !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined
    ) {
      await this.avisar(
        siguen,
        userId,
        'Se editó una tarea',
        `Se actualizó la tarea "${updated.title}".`,
        id,
      );
    }
    const quitados = [...antes].filter((u) => !ahora.includes(u));
    await this.avisar(
      quitados,
      userId,
      'Ya no tienes una tarea',
      `Te quitaron de la tarea "${updated.title}".`,
      id,
    );

    return updated;
  }

  async remove(
    id: number,
    userId: number,
    userRole: UserRole,
    companyId: number | null = null,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: { select: { userId: true } },
        project: {
          select: {
            id: true,
            members: {
              where: { userId },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    if (task.projectId == null) {
      const actor = { userId, role: userRole, companyId };
      if (!(await this.puedeGestionarSinProyecto(task, actor))) {
        throw new ForbiddenException('No puedes eliminar esta tarea');
      }
    } else {
      const membership = task.project?.members[0];

      if (!membership && userRole !== UserRole.ADMIN) {
        throw new ForbiddenException('No eres miembro de este proyecto');
      }

      if (
        membership?.role === ('VIEWER' as any) &&
        userRole !== UserRole.ADMIN
      ) {
        throw new ForbiddenException(
          'Los observadores no pueden eliminar tareas',
        );
      }
    }

    await this.prisma.task.delete({ where: { id } });
    await this.avisar(
      task.assignees.map((a) => a.userId),
      userId,
      'Se eliminó una tarea',
      `Se eliminó la tarea "${task.title}".`,
      null,
    );
    return { message: 'Tarea eliminada' };
  }

  async getProjectMembers(projectId: number) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async findMyTasks(
    userId: number,
    filters: {
      status?: string;
      assignedToMe?: boolean;
      projectId?: number;
      sinProyecto?: boolean;
    },
  ) {
    // Mis tareas = las de los proyectos donde soy miembro + las «Sin proyecto» que
    // creé o que me asignaron.
    const sinProyectoMias = {
      projectId: null,
      OR: [{ createdById: userId }, { assignees: { some: { userId } } }],
    };
    const and: any[] = [
      {
        OR: [{ project: { members: { some: { userId } } } }, sinProyectoMias],
      },
    ];

    if (filters.status) {
      and.push({ status: filters.status });
    }

    if (filters.assignedToMe) {
      and.push({ assignees: { some: { userId } } });
    }

    if (filters.sinProyecto) {
      and.push({ projectId: null });
    } else if (filters.projectId) {
      and.push({ projectId: filters.projectId });
    }

    return this.prisma.task.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      include: {
        assignees: {
          select: { user: this.assigneeSelect },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });
  }
}
