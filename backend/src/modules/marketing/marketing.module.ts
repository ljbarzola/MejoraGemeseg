import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AgentsModule } from '../agents/agents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PersonalModule } from '../personal/personal.module';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [PrismaModule, PermissionsModule, AgentsModule, NotificationsModule, PersonalModule],
  controllers: [MarketingController],
  providers: [MarketingService, VertexChatClient, GoogleAuthService],
})
export class MarketingModule {}
