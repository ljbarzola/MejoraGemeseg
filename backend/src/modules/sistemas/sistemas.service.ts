import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketSoporteEstado, TicketSoporteTipo } from '@prisma/client';

@Injectable()
export class SistemasService {
  private readonly logger = new Logger(SistemasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTicket(
    companyId: number | null,
    createdById: number,
    data: {
      tipo: TicketSoporteTipo;
      titulo: string;
      descripcion: string;
      capturaUrl?: string;
      attachments?: { url: string; nombre?: string }[];
    },
  ) {
    const ticket = await this.prisma.ticketSoporte.create({
      data: {
        companyId,
        createdById,
        tipo: data.tipo,
        titulo: data.titulo.trim(),
        descripcion: data.descripcion.trim(),
        capturaUrl: data.capturaUrl?.trim() || null,
        attachments: data.attachments?.length
          ? { create: data.attachments.map((a) => ({ url: a.url, nombre: a.nombre || null })) }
          : undefined,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true } },
        attachments: true,
      },
    });
    this.logger.log(`Ticket #${ticket.id} creado por usuario ${createdById}`);
    return ticket;
  }

  async findAll() {
    return this.prisma.ticketSoporte.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true } },
        attachments: true,
      },
    });
  }

  async updateEstado(id: number, estado: TicketSoporteEstado) {
    const ticket = await this.prisma.ticketSoporte.findUnique({ where: { id } });
    if (!ticket) {
      throw new Error(`Ticket #${id} no encontrado`);
    }
    return this.prisma.ticketSoporte.update({
      where: { id },
      data: {
        estado,
        resueltoAt: estado === 'RESUELTO' ? new Date() : null,
      },
    });
  }

  async getStats(companyId: number) {
    const [abiertos, enRevision, resueltos, totalMes] = await Promise.all([
      this.prisma.ticketSoporte.count({ where: { companyId, estado: 'ABIERTO' } }),
      this.prisma.ticketSoporte.count({ where: { companyId, estado: 'EN_REVISION' } }),
      this.prisma.ticketSoporte.count({ where: { companyId, estado: 'RESUELTO' } }),
      this.prisma.ticketSoporte.count({
        where: {
          companyId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);
    return { abiertos, enRevision, resueltos, totalMes };
  }
}
