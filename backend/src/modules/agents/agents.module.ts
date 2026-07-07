import { Module } from '@nestjs/common';
import { AgentsController, AgentsUserController } from './agents.controller';
import { AgentsService } from './agents.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AgentsController, AgentsUserController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
