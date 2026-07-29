import { Module } from '@nestjs/common';
import { CacaoLotsController } from './lots.controller';
import { CacaoLotsService } from './lots.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoLotsController],
  providers: [CacaoLotsService],
})
export class CacaoLotsModule {}
