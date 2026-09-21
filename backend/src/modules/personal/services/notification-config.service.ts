import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NotificationConfigService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.notificationConfig.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }
}
