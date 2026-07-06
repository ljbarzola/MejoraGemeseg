import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await bcrypt.hash(dto.password || 'gemeseg2026', 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        role: dto.role || 'EMPLOYEE',
        documentNumber: dto.documentNumber,
        position: dto.position,
        departmentId: dto.departmentId || null,
        roleId: dto.roleId || null,
      },
      include: {
        department: true,
        roleRelation: true,
      },
    });
  }

  async findAll(query?: { role?: string; isActive?: string; search?: string }) {
    const where: any = {};

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        department: true,
        roleRelation: true,
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        roleRelation: true,
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
    }

    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.documentNumber !== undefined) data.documentNumber = dto.documentNumber;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
    if (dto.roleId !== undefined) data.roleId = dto.roleId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        department: true,
        roleRelation: true,
      },
    });
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Usuario desactivado correctamente' };
  }

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        position: true,
        documentNumber: true,
        department: true,
        roleRelation: true,
        createdAt: true,
        toolAssignments: {
          include: {
            tool: { select: { id: true, name: true, category: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async getStats() {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.map((r) => ({ role: r.role, count: r._count.id })),
    };
  }
}
