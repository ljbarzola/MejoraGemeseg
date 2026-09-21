import { Module } from '@nestjs/common';
import { CacaoPriceFixingsController } from './price-fixings.controller';
import { CacaoPriceFixingsService } from './price-fixings.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoPriceFixingsController],
  providers: [CacaoPriceFixingsService],
})
export class CacaoPriceFixingsModule {}
