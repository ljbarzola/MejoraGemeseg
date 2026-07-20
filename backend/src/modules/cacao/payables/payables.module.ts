import { Module } from '@nestjs/common';
import { CacaoPayablesController } from './payables.controller';
import { CacaoPayablesService } from './payables.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoPayablesController],
  providers: [CacaoPayablesService],
})
export class CacaoPayablesModule {}
