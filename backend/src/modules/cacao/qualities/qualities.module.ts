import { Module } from '@nestjs/common';
import { CacaoQualitiesController } from './qualities.controller';
import { CacaoQualitiesService } from './qualities.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoQualitiesController],
  providers: [CacaoQualitiesService],
  exports: [CacaoQualitiesService],
})
export class CacaoQualitiesModule {}
