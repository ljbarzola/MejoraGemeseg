import { Module } from '@nestjs/common';
import { CacaoSettlementsController } from './settlements.controller';
import { CacaoSettlementsService } from './settlements.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoSettlementsController],
  providers: [CacaoSettlementsService],
})
export class CacaoSettlementsModule {}
