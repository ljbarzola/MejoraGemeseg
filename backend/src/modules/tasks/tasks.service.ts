import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MemberRole } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(projectId: number, dto: CreateTaskDto, userId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    if (membership.role === MemberRole.VIEWER) {
      throw new ForbiddenException('Los VIEWER no pueden crear tareas');
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        estimatedHours: dto.estimatedHours ?? null,
        projectId,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return task;
  }

  async findByProject(projectId: number, userId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tasks;
  }

  async findOne(id: number, userId: number) {
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

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    return task;
  }

  async update(id: number, dto: UpdateTaskDto, userId: number) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    if (membership.role === MemberRole.VIEWER) {
      throw new ForbiddenException('Los VIEWER no pueden editar tareas');
    }

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId === null) {
        dto.assigneeId = undefined;
      } else {
        const assigneeMembership = await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: task.projectId, userId: dto.assigneeId } },
        });

        if (!assigneeMembership) {
          throw new BadRequestException('El usuario asignado no es miembro de este proyecto');
        }
      }
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.estimatedHours !== undefined && { estimatedHours: dto.estimatedHours }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return updated;
  }

  async getProjectMembers(projectId: number, userId: number) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return members;
  }

  async remove(id: number, userId: number) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Tarea con id ${id} no encontrada`);
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('No eres miembro de este proyecto');
    }

    if (membership.role === MemberRole.VIEWER) {
      throw new ForbiddenException('Los VIEWER no pueden eliminar tareas');
    }

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Tarea eliminada' };
  }
}
