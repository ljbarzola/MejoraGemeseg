import { Module } from '@nestjs/common';
import { CacaoClientsController } from './clients.controller';
import { CacaoClientsService } from './clients.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoClientsController],
  providers: [CacaoClientsService],
})
export class CacaoClientsModule {}
