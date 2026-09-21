import { Module } from '@nestjs/common';
import { CacaoDashboardController } from './dashboard.controller';
import { CacaoDashboardService } from './dashboard.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoDashboardController],
  providers: [CacaoDashboardService],
})
export class CacaoDashboardModule {}
