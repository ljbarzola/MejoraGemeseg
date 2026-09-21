import { Module } from '@nestjs/common';
import { CacaoClientsController } from './clients.controller';
import { CacaoClientsService } from './clients.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoClientsController],
  providers: [CacaoClientsService],
})
export class CacaoClientsModule {}
