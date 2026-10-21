import { Module } from '@nestjs/common';
import { AgentsController, AgentsUserController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRunService } from './agent-run.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [AgentsController, AgentsUserController],
  providers: [AgentsService, AgentRunService],
  exports: [AgentsService, AgentRunService],
})
export class AgentsModule {}
