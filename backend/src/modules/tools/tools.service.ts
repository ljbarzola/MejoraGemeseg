import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { AssignToolDto } from './dto/assign-tool.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Injectable()
export class ToolsService {
  constructor(private prisma: PrismaService) {}

  async findAllTools() {
    return this.prisma.tool.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
  }

  async createTool(dto: CreateToolDto) {
    const existing = await this.prisma.tool.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Ya existe una herramienta con ese nombre');
    return this.prisma.tool.create({ data: { name: dto.name, category: dto.category } });
  }

  async removeTool(id: number) {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('Herramienta no encontrada');
    await this.prisma.tool.delete({ where: { id } });
    return { message: 'Herramienta eliminada' };
  }

  async findAllAssignments(toolFilter?: string, userFilter?: string) {
    const where: any = {};
    if (toolFilter) {
      where.tool = { name: { contains: toolFilter, mode: 'insensitive' } };
    }
    if (userFilter) {
      where.user = {
        OR: [
          { fullName: { contains: userFilter, mode: 'insensitive' } },
          { email: { contains: userFilter, mode: 'insensitive' } },
        ],
      };
    }
    return this.prisma.toolAssignment.findMany({
      where,
      include: {
        tool: { select: { id: true, name: true, category: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignTool(dto: AssignToolDto, performedBy: number) {
    const tool = await this.prisma.tool.findUnique({ where: { id: dto.toolId } });
    if (!tool) throw new NotFoundException('Herramienta no encontrada');

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const existing = await this.prisma.toolAssignment.findUnique({
      where: { toolId_userId: { toolId: dto.toolId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('Esta herramienta ya está asignada a este usuario');

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

  async updateAssignment(id: number, dto: UpdateAssignmentDto, performedBy: number) {
    const assignment = await this.prisma.toolAssignment.findUnique({
      where: { id },
      include: { tool: true, user: true },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada');

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

    const changes = Object.keys(data).map((k) => `${k}: ${data[k]}`).join(', ');
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

  async removeAssignment(id: number, performedBy: number) {
    const assignment = await this.prisma.toolAssignment.findUnique({
      where: { id },
      include: { tool: true, user: true },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada');

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

  async getAuditLog(assignmentId: number) {
    return this.prisma.toolAuditLog.findMany({
      where: { assignmentId },
      include: {
        performer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUsersWithTools() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
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
