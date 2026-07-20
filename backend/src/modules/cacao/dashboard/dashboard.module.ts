import { Module } from '@nestjs/common';
import { CacaoDashboardController } from './dashboard.controller';
import { CacaoDashboardService } from './dashboard.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoDashboardController],
  providers: [CacaoDashboardService],
})
export class CacaoDashboardModule {}
