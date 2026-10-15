import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { AssignToolDto } from './dto/assign-tool.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

/** Quién llama (forma de `req.user`): rol y empresa deciden qué ve y toca. */
export interface Actor {
  role: string;
  companyId: number | null;
}

@Injectable()
export class ToolsService {
  constructor(private prisma: PrismaService) {}

  // `Tool` es un catálogo compartido (sin companyId, y no se agrega la columna:
  // el despliegue no corre migraciones). Lo que sí pertenece a una empresa son
  // las asignaciones, a través de la persona a la que se asignan.
  private esSuperAdmin(actor: Actor): boolean {
    return actor.role === 'ADMIN' && !actor.companyId;
  }

  /** Filtro de usuario por empresa; el super administrador lo ve todo. */
  private filtroEmpresa(actor: Actor): { companyId?: number } {
    return this.esSuperAdmin(actor) ? {} : { companyId: actor.companyId ?? -1 };
  }

  private assertMismaEmpresa(actor: Actor, companyId: number | null) {
    if (this.esSuperAdmin(actor)) return;
    if (!actor.companyId || companyId !== actor.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }
  }

  async findAllTools(actor: Actor) {
    return this.prisma.tool.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            assignments: { where: { user: this.filtroEmpresa(actor) } },
          },
        },
      },
    });
  }

  async createTool(dto: CreateToolDto) {
    const existing = await this.prisma.tool.findUnique({
      where: { name: dto.name },
    });
    if (existing)
      throw new ConflictException('Ya existe una herramienta con ese nombre');
    return this.prisma.tool.create({
      data: { name: dto.name, category: dto.category },
    });
  }

  async removeTool(id: number, actor: Actor) {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('Herramienta no encontrada');
    // Borrar la herramienta borra en cascada TODAS sus asignaciones: si otra
    // empresa la usa, no es decisión de esta.
    if (!this.esSuperAdmin(actor)) {
      const deOtras = await this.prisma.toolAssignment.count({
        where: {
          toolId: id,
          user: {
            OR: [{ companyId: null }, { companyId: { not: actor.companyId } }],
          },
        },
      });
      if (deOtras > 0) {
        throw new ConflictException(
          'Esta herramienta también la usan otras empresas; no se puede eliminar.',
        );
      }
    }
    await this.prisma.tool.delete({ where: { id } });
    return { message: 'Herramienta eliminada' };
  }

  async findAllAssignments(
    actor: Actor,
    toolFilter?: string,
    userFilter?: string,
  ) {
    const where: any = {};
    if (toolFilter) {
      where.tool = { name: { contains: toolFilter, mode: 'insensitive' } };
    }
    where.user = {
      ...this.filtroEmpresa(actor),
      ...(userFilter
        ? {
            OR: [
              { fullName: { contains: userFilter, mode: 'insensitive' } },
              { email: { contains: userFilter, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.toolAssignment.findMany({
      where,
      include: {
        tool: { select: { id: true, name: true, category: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignTool(dto: AssignToolDto, actor: Actor, performedBy: number) {
    const tool = await this.prisma.tool.findUnique({
      where: { id: dto.toolId },
    });
    if (!tool) throw new NotFoundException('Herramienta no encontrada');

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    this.assertMismaEmpresa(actor, user.companyId);

    const existing = await this.prisma.toolAssignment.findUnique({
      where: { toolId_userId: { toolId: dto.toolId, userId: dto.userId } },
    });
    if (existing)
      throw new ConflictException(
        'Esta herramienta ya está asignada a este usuario',
      );

    const assignment = await this.prisma.toolAssignment.create({
      data: {
        toolId: dto.toolId,
        userId: dto.userId,
        version: dto.version,
        licenseKey: dto.licenseKey,
      },
      include: {
        tool: { select: { id: true, name: true, category: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    await this.prisma.toolAuditLog.create({
      data: {
        assignmentId: assignment.id,
        action: 'ASSIGNED',
        performedBy,
        details: `Herramienta "${tool.name}" asignada a ${user.fullName}`,
      },
    });

    return assignment;
  }

  async updateAssignment(
    id: number,
    dto: UpdateAssignmentDto,
    actor: Actor,
    performedBy: number,
  ) {
    const assignment = await this.prisma.toolAssignment.findUnique({
      where: { id },
      include: { tool: true, user: true },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada');
    this.assertMismaEmpresa(actor, assignment.user.companyId);

    const data: any = {};
    if (dto.version !== undefined) data.version = dto.version;
    if (dto.licenseKey !== undefined) data.licenseKey = dto.licenseKey;

    const updated = await this.prisma.toolAssignment.update({
      where: { id },
      data,
      include: {
        tool: { select: { id: true, name: true, category: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    const changes = Object.keys(data)
      .map((k) => `${k}: ${data[k]}`)
      .join(', ');
    await this.prisma.toolAuditLog.create({
      data: {
        assignmentId: id,
        action: 'UPDATED',
        performedBy,
        details: `Actualizado: ${changes}`,
      },
    });

    return updated;
  }

  async removeAssignment(id: number, actor: Actor, performedBy: number) {
    const assignment = await this.prisma.toolAssignment.findUnique({
      where: { id },
      include: { tool: true, user: true },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada');
    this.assertMismaEmpresa(actor, assignment.user.companyId);

    await this.prisma.toolAuditLog.create({
      data: {
        assignmentId: id,
        action: 'REMOVED',
        performedBy,
        details: `Herramienta "${assignment.tool.name}" retirada de ${assignment.user.fullName}`,
      },
    });

    await this.prisma.toolAssignment.delete({ where: { id } });
    return { message: 'Asignación eliminada' };
  }

  async getAuditLog(assignmentId: number, actor: Actor) {
    const assignment = await this.prisma.toolAssignment.findUnique({
      where: { id: assignmentId },
      select: { user: { select: { companyId: true } } },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada');
    this.assertMismaEmpresa(actor, assignment.user.companyId);

    return this.prisma.toolAuditLog.findMany({
      where: { assignmentId },
      include: {
        performer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUsersWithTools(actor: Actor) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, ...this.filtroEmpresa(actor) },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        toolAssignments: {
          include: {
            tool: { select: { id: true, name: true, category: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return users;
  }
}
