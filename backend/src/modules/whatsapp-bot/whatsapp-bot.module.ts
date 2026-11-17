import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VentasModule } from '../ventas/ventas.module';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappMetaClient } from './whatsapp-meta.client';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappBotController, WhatsappBotWebhookController } from './whatsapp-bot.controller';

// Bot de WhatsApp de Ventas (2026-11-12). Módulo aparte para no cruzar dependencias: AiModule ya
// importa VentasModule, así que el bot toma el cliente de Vertex directamente.
@Module({
  imports: [PrismaModule, PermissionsModule, NotificationsModule, VentasModule],
  controllers: [WhatsappBotWebhookController, WhatsappBotController],
  providers: [WhatsappBotService, WhatsappMetaClient, WhatsappMediaService, VertexChatClient, GoogleAuthService],
})
export class WhatsappBotModule {}
