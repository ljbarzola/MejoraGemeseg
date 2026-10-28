import { Module } from '@nestjs/common';
import { CacaoPayablesController } from './payables.controller';
import { CacaoPayablesService } from './payables.service';
import { CacaoPaymentRequestsService } from './payment-requests.service';
import { CacaoConfigModule } from '../config/cacao-config.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule, CacaoConfigModule],
  controllers: [CacaoPayablesController],
  providers: [CacaoPayablesService, CacaoPaymentRequestsService],
})
export class CacaoPayablesModule {}
