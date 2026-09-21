import { Module } from '@nestjs/common';
import { CacaoReceivablesController } from './receivables.controller';
import { CacaoReceivablesService } from './receivables.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoReceivablesController],
  providers: [CacaoReceivablesService],
})
export class CacaoReceivablesModule {}
