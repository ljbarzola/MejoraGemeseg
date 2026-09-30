import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';
import { VertexChatClient } from './vertex-chat.client';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { GoogleAuthService } from '../../common/services/google-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [AiController],
  providers: [AiService, AiProcessor, VertexChatClient, GoogleAuthService],
  exports: [AiService],
})
export class AiModule {}
