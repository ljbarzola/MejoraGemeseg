import { Module } from '@nestjs/common';
import { CacaoPayablesController } from './payables.controller';
import { CacaoPayablesService } from './payables.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoPayablesController],
  providers: [CacaoPayablesService],
})
export class CacaoPayablesModule {}
