import { Module } from '@nestjs/common';
import { CacaoKardexController } from './kardex.controller';
import { CacaoKardexService } from './kardex.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoKardexController],
  providers: [CacaoKardexService],
})
export class CacaoKardexModule {}
