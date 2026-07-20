import { Module } from '@nestjs/common';
import { CacaoReceivablesController } from './receivables.controller';
import { CacaoReceivablesService } from './receivables.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoReceivablesController],
  providers: [CacaoReceivablesService],
})
export class CacaoReceivablesModule {}
