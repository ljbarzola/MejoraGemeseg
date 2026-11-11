import { Module } from '@nestjs/common';
import { AgentsController, AgentsUserController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRunService } from './agent-run.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { MejoraContinuaService } from './mejora-continua/mejora-continua.service';
import {
  MejoraContinuaAdminController,
  MejoraContinuaRutinasController,
} from './mejora-continua/mejora-continua.controller';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, NotificationsModule, MailModule],
  controllers: [
    AgentsController,
    AgentsUserController,
    MejoraContinuaAdminController,
    MejoraContinuaRutinasController,
  ],
  providers: [AgentsService, AgentRunService, MejoraContinuaService],
  exports: [AgentsService, AgentRunService],
})
export class AgentsModule {}
