import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { CPDashboardController } from './cp-dashboard.controller';
import { CPDashboardService } from './cp-dashboard.service';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPDashboardController],
  providers: [CPDashboardService],
})
export class CPDashboardModule {}
