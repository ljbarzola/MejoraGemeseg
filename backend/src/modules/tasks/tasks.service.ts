import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
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

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prisma: PrismaService) {}

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

  async findOne(id: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: {
          select: { user: this.assigneeSelect },
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

    const { reminders, ...resto } = task;
    return {
      ...resto,
      reminderDays: reminders
        .map((r) => r.daysBefore)
        .sort((a, b) => b - a),
    };
  }

  async create(
    projectId: number,
    dto: CreateTaskDto,
    userId: number,
    userRole: UserRole,
  ) {
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

    const assigneeIds = dto.assigneeIds || [];

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

    return task;
  }

  async update(
    id: number,
    dto: UpdateTaskDto,
    userId: number,
    userRole: UserRole,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
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

    const membership = task.project.members[0];

    if (!membership && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    if (membership?.role === ('VIEWER' as any) && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Los observadores no pueden editar tareas');
    }

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

    return updated;
  }

  async remove(id: number, userId: number, userRole: UserRole) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
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

    const membership = task.project.members[0];

    if (!membership && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    if (membership?.role === ('VIEWER' as any) && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Los observadores no pueden eliminar tareas',
      );
    }

    await this.prisma.task.delete({ where: { id } });
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
    filters: { status?: string; assignedToMe?: boolean; projectId?: number },
  ) {
    const where: any = {
      project: {
        members: { some: { userId } },
      },
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedToMe) {
      where.assignees = { some: { userId } };
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    return this.prisma.task.findMany({
      where,
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
