import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findByProject(projectId: number) {
    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    return task;
  }

  async create(projectId: number, dto: CreateTaskDto, userId: number, userRole: UserRole) {
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

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: (dto.priority as any) || 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        estimatedHours: dto.estimatedHours || null,
        projectId,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return task;
  }

  async update(id: number, dto: UpdateTaskDto, userId: number, userRole: UserRole) {
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
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.estimatedHours !== undefined) data.estimatedHours = dto.estimatedHours;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

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
      throw new ForbiddenException('Los observadores no pueden eliminar tareas');
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
}
