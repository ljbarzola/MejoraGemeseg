import { Module } from '@nestjs/common';
import { CPEntidadesController } from './entidades.controller';
import { CPEntidadesService } from './entidades.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPEntidadesController],
  providers: [CPEntidadesService],
  exports: [CPEntidadesService],
})
export class CPEntidadesModule {}
