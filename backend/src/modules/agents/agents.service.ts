import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const agents = await this.prisma.agent.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });

    const userMap = new Map<number, any>();
    for (const u of users) {
      userMap.set(u.id, { ...u, agent: null as any });
    }
    for (const a of agents) {
      if (a.userId && userMap.has(a.userId)) {
        userMap.get(a.userId)!.agent = a;
      }
    }

    return Array.from(userMap.values());
  }

  async findByUser(userId: number) {
    const agent = await this.prisma.agent.findFirst({
      where: { userId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    return agent;
  }

  async create(dto: CreateAgentDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const existing = await this.prisma.agent.findUnique({
      where: { userId_name: { userId: dto.userId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Ya existe un agente con ese nombre para este usuario');

    return this.prisma.agent.create({
      data: {
        userId: dto.userId,
        name: dto.name,
        instructions: dto.systemMsg,
        scope: dto.scope || 'GLOBAL',
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
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
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async remove(id: number) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agente no encontrado');

    await this.prisma.agent.delete({ where: { id } });
    return { message: 'Agente eliminado (revertido a prompt base)' };
  }
}
