import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { UserRole } from '@prisma/client';

const PAGE_SIZE = 10;

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto, userId: number, userRole: UserRole) {
    const adminUser = await this.prisma.user.findUnique({
      where: { email: 'admin@gemeseg.com' },
      select: { id: true },
    });

    const membersToCreate = [
      { userId, role: 'OWNER' as const },
    ];

    if (adminUser && adminUser.id !== userId) {
      membersToCreate.push({ userId: adminUser.id, role: 'OWNER' as const });
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: userId,
        members: {
          create: membersToCreate,
        },
      },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
        _count: {
          select: { tasks: true },
        },
      },
    });

    return project;
  }

  async findAll(userId: number, userRole: UserRole, query: ListProjectsDto) {
    const page = query.page || 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = {};

    if (userRole !== UserRole.ADMIN) {
      where.OR = [
        { createdById: userId },
        { members: { some: { userId } } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          _count: {
            select: { tasks: true, members: true },
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    };
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
        _count: {
          select: { tasks: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }

    return project;
  }

  async update(id: number, dto: CreateProjectDto, userId: number, userRole: UserRole) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (userRole !== UserRole.ADMIN) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      });
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'MEMBER')) {
        throw new ForbiddenException('Solo propietarios y miembros pueden editar el proyecto');
      }
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.project.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        members: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
        _count: { select: { tasks: true } },
      },
    });
  }

  async remove(id: number, userId: number, userRole: UserRole) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (userRole !== UserRole.ADMIN) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      });
      if (!membership || membership.role !== 'OWNER') {
        throw new ForbiddenException('Solo los propietarios pueden eliminar el proyecto');
      }
    }

    await this.prisma.project.delete({ where: { id } });
    return { message: 'Proyecto eliminado' };
  }

  async getAdminStats() {
    const [total, byStatus, taskStats] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const totalTasks = taskStats.reduce((sum, s) => sum + s._count.id, 0);
    const completedTasks = taskStats.find((s) => s.status === 'DONE')?._count.id || 0;

    return {
      totalProjects: total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        byStatus: taskStats.map((s) => ({ status: s.status, count: s._count.id })),
      },
    };
  }

  private async assertOwner(projectId: number, userId: number, userRole: UserRole) {
    if (userRole === UserRole.ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Solo los propietarios pueden gestionar miembros');
    }
  }

  async addMember(projectId: number, targetUserId: number, role: string, userId: number, userRole: UserRole) {
    await this.assertOwner(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser || targetUser.isActive === false) {
      throw new NotFoundException('Usuario no encontrado o inactivo');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    if (existing) {
      throw new ForbiddenException('El usuario ya es miembro de este proyecto');
    }

    return this.prisma.projectMember.create({
      data: {
        projectId,
        userId: targetUserId,
        role: role as any,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async removeMember(projectId: number, targetUserId: number, userId: number, userRole: UserRole) {
    await this.assertOwner(projectId, userId, userRole);

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    if (!membership) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    if (membership.role === 'OWNER') {
      const ownerCount = await this.prisma.projectMember.count({
        where: { projectId, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('No se puede eliminar al único propietario del proyecto');
      }
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    return { message: 'Miembro eliminado del proyecto' };
  }

  async updateMemberRole(projectId: number, targetUserId: number, newRole: string, userId: number, userRole: UserRole) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede cambiar roles de propietario');
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    if (!membership) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    if (membership.role === 'OWNER' && newRole !== 'OWNER') {
      const ownerCount = await this.prisma.projectMember.count({
        where: { projectId, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('No se puede degradar al único propietario');
      }
    }

    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: newRole as any },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }
}
