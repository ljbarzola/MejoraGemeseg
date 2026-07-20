import { Module } from '@nestjs/common';
import { CacaoSettlementsController } from './settlements.controller';
import { CacaoSettlementsService } from './settlements.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoSettlementsController],
  providers: [CacaoSettlementsService],
})
export class CacaoSettlementsModule {}
