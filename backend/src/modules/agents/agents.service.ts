import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async findAllAgents() {
    return this.prisma.agent.findMany({
      select: {
        id: true, name: true, instructions: true, scope: true,
        isActive: true, createdBy: true, createdAt: true,
        _count: { select: { userLinks: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAllAssignments() {
    return this.prisma.userAgent.findMany({
      include: {
        agent: {
          select: { id: true, name: true, scope: true, isActive: true },
        },
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });

    const userLinks = await this.prisma.userAgent.findMany({
      include: {
        agent: {
          select: {
            id: true, name: true, instructions: true, scope: true,
            isActive: true, createdBy: true, createdAt: true,
          },
        },
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    const agentUserMap = new Map<number, { id: number; fullName: string; email: string }[]>();
    for (const link of userLinks) {
      if (!agentUserMap.has(link.agentId)) {
        agentUserMap.set(link.agentId, []);
      }
      agentUserMap.get(link.agentId)!.push(link.user);
    }

    const userMap = new Map<number, any>();
    for (const u of users) {
      userMap.set(u.id, { ...u, agents: [] as any[] });
    }
    for (const link of userLinks) {
      if (userMap.has(link.userId)) {
        const agentData = { ...link.agent, assignedUsers: agentUserMap.get(link.agentId) || [] };
        userMap.get(link.userId)!.agents.push(agentData);
      }
    }

    return Array.from(userMap.values());
  }

  async findByUser(userId: number) {
    const links = await this.prisma.userAgent.findMany({
      where: { userId },
      include: {
        agent: {
          select: {
            id: true, name: true, instructions: true, scope: true,
            isActive: true, createdBy: true, createdAt: true,
          },
        },
      },
    });
    return links.map((l) => l.agent);
  }

  async create(dto: CreateAgentDto) {
    const existing = await this.prisma.agent.findFirst({
      where: { createdBy: dto.userId, name: dto.name },
    });
    if (existing) throw new ConflictException('Ya existe un agente con ese nombre para este usuario');

    const agent = await this.prisma.agent.create({
      data: {
        name: dto.name,
        instructions: dto.systemMsg,
        scope: dto.scope || 'GLOBAL',
        createdBy: dto.userId,
      },
    });

    await this.prisma.userAgent.create({
      data: { userId: dto.userId, agentId: agent.id },
    });

    return agent;
  }

  async update(id: number, dto: UpdateAgentDto) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agente no encontrado');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.systemMsg !== undefined) data.instructions = dto.systemMsg;
    if (dto.scope !== undefined) data.scope = dto.scope;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.agent.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agente no encontrado');

    await this.prisma.agent.delete({ where: { id } });
    return { message: 'Agente eliminado (revertido a prompt base)' };
  }

  async getAvailableForUser(userId: number) {
    const userLinks = await this.prisma.userAgent.findMany({
      where: { userId },
      select: { agentId: true },
    });
    const assignedAgentIds = userLinks.map((l) => l.agentId);

    const agents = await this.prisma.agent.findMany({
      where: {
        isActive: true,
        OR: [
          { createdBy: null },
          { id: { in: assignedAgentIds } },
        ],
      },
      select: {
        id: true, name: true, instructions: true, scope: true,
        isActive: true, createdBy: true,
      },
      orderBy: { name: 'asc' },
    });

    const defaultAgent = await this.prisma.agent.findFirst({
      where: { createdBy: null, name: 'Agente GEMESEG' },
      select: {
        id: true, name: true, instructions: true, scope: true,
        isActive: true, createdBy: true,
      },
    });

    return { agents, defaultAgent };
  }

  async assignToUser(agentId: number, userId: number) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agente no encontrado');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const exists = await this.prisma.userAgent.findUnique({
      where: { userId_agentId: { userId, agentId } },
    });
    if (exists) throw new ConflictException('El usuario ya tiene acceso a este agente');

    return this.prisma.userAgent.create({ data: { userId, agentId } });
  }

  async unassignFromUser(agentId: number, userId: number) {
    await this.prisma.userAgent.delete({
      where: { userId_agentId: { userId, agentId } },
    });
    return { message: 'Agente removido del usuario' };
  }
}
