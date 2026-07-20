import { Module } from '@nestjs/common';
import { CacaoQualitiesController } from './qualities.controller';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoQualitiesController],
})
export class CacaoQualitiesModule {}
