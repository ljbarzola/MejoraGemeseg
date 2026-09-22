import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GmailMailService } from '../../mail/gmail-mail.service';

@Injectable()
export class NotificationConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailMailService: GmailMailService,
  ) {}

  async get(companyId: number) {
    return this.prisma.notificationConfig.findUnique({
      where: { companyId },
    });
  }

  async upsert(
    companyId: number,
    data: {
      senderEmail?: string;
      senderName?: string;
      whatsappProvider?: string;
      whatsappApiKey?: string;
      whatsappFrom?: string;
    },
  ) {
    // Se comprueba la casilla ANTES de guardarla, sin mandar ningún correo.
    // Si no, un error de tipeo se descubría recién cuando alguien intentaba
    // enviarle un recordatorio a un guardia, que es el peor momento.
    const senderEmail = data.senderEmail?.trim();
    if (senderEmail) {
      await this.gmailMailService.verificarRemitente(senderEmail);
    }

    const limpio = { ...data, senderEmail: senderEmail || undefined };
    return this.prisma.notificationConfig.upsert({
      where: { companyId },
      create: { companyId, ...limpio },
      update: limpio,
    });
  }
}
