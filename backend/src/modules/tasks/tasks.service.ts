import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(projectId: number, dto: CreateTaskDto, userId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Proyecto ${projectId} no encontrado`);

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership || membership.role === 'VIEWER') {
      throw new ForbiddenException('No tienes permiso para crear tareas en este proyecto');
    }

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        estimatedHours: dto.estimatedHours,
        projectId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findByProject(projectId: number) {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const grouped = {
      TODO: tasks.filter((t) => t.status === 'TODO'),
      IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
      IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW'),
      DONE: tasks.filter((t) => t.status === 'DONE'),
    };

    return { tasks, grouped };
  }

  async findOne(id: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            members: {
              include: { user: { select: { id: true, fullName: true, email: true } } },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException(`Tarea ${id} no encontrada`);
    return task;
  }

  async update(id: number, dto: UpdateTaskDto, userId: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!task) throw new NotFoundException(`Tarea ${id} no encontrada`);

    if (dto.assigneeId) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId: dto.assigneeId } },
      });
      if (!member) throw new ForbiddenException('El asignado no es miembro del proyecto');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.estimatedHours !== undefined && { estimatedHours: dto.estimatedHours }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }
}
