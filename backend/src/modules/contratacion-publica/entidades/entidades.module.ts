import { Module } from '@nestjs/common';
import { CPEntidadesController } from './entidades.controller';
import { CPEntidadesService } from './entidades.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { PersonalModule } from '../../personal/personal.module';

@Module({
  imports: [PrismaModule, PermissionsModule, PersonalModule],
  controllers: [CPEntidadesController],
  providers: [CPEntidadesService],
  exports: [CPEntidadesService],
})
export class CPEntidadesModule {}
