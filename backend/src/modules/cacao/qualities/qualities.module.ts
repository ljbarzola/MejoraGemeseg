import { Module } from '@nestjs/common';
import { CacaoQualitiesController } from './qualities.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoQualitiesController],
})
export class CacaoQualitiesModule {}
