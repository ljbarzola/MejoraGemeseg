import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationInput {
  userId: number;
  companyId: number;
  title: string;
  message: string;
  link?: string | null;
}

// Bandeja de notificaciones in-app genérica: por ahora la usa Referidos, pero
// no depende de él — cualquier módulo puede llamar a create() para avisarle
// algo a un usuario concreto dentro de la app.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
      },
    });
  }

  async listForUser(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, leida: false },
    });
    return { count };
  }

  async markRead(id: number, userId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification)
      throw new NotFoundException('Notificación no encontrada');
    return this.prisma.notification.update({
      where: { id },
      data: { leida: true },
    });
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, leida: false },
      data: { leida: true },
    });
    return { ok: true };
  }
}
