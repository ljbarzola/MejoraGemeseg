import { Module } from '@nestjs/common';
import { CacaoPriceFixingsController } from './price-fixings.controller';
import { CacaoPriceFixingsService } from './price-fixings.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoPriceFixingsController],
  providers: [CacaoPriceFixingsService],
})
export class CacaoPriceFixingsModule {}
