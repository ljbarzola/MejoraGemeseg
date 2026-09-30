import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketSoporteEstado, TicketSoporteTipo } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SistemasService {
  private readonly logger = new Logger(SistemasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Avisa a quien reportó, SOLO dentro de la app (campana de notificaciones):
  // nunca por correo. Un fallo acá nunca debe deshacer ni bloquear el cambio
  // que ya se guardó.
  private async notificarReportante(
    ticket: { id: number; companyId: number | null; createdById: number },
    title: string,
    message: string,
  ) {
    try {
      // La notificación exige empresa. Un ticket de super admin no la tiene:
      // se usa la del usuario y, si tampoco, no hay a quién colgársela.
      let companyId = ticket.companyId;
      if (companyId === null) {
        const user = await this.prisma.user.findUnique({
          where: { id: ticket.createdById },
          select: { companyId: true },
        });
        companyId = user?.companyId ?? null;
      }
      if (companyId === null) return;

      await this.notificationsService.create({
        userId: ticket.createdById,
        companyId,
        title,
        message,
        // /sistemas/soporte es solo para Sistemas; el reportante puede no
        // tener esa sección, así que se lo lleva al inicio.
        link: '/dashboard',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo crear la notificación del ticket #${ticket.id}: ${err.message}`,
        err.stack,
      );
    }
  }

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
    await this.notificarReportante(
      ticket,
      'Recibimos tu reporte',
      `Tu reporte "${ticket.titulo}" llegó a Sistemas. Te avisaremos cuando esté en revisión y cuando quede resuelto.`,
    );
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
    const updated = await this.prisma.ticketSoporte.update({
      where: { id },
      data: {
        estado,
        resueltoAt: estado === 'RESUELTO' ? new Date() : null,
      },
    });

    // Solo si el estado realmente cambió, y solo para los dos que le importan
    // a quien reportó (volver a "Abierto" no se avisa).
    if (estado !== ticket.estado) {
      if (estado === 'EN_REVISION') {
        await this.notificarReportante(
          ticket,
          'Tu reporte está en revisión',
          `Sistemas ya está revisando tu reporte "${ticket.titulo}".`,
        );
      } else if (estado === 'RESUELTO') {
        await this.notificarReportante(
          ticket,
          'Tu reporte fue resuelto',
          `Tu reporte "${ticket.titulo}" ya fue resuelto. Si el problema sigue, envía un reporte nuevo.`,
        );
      }
    }
    return updated;
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
