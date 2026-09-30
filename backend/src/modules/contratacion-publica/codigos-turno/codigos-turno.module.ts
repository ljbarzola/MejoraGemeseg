import { Module } from '@nestjs/common';
import { CPCodigosTurnoController } from './codigos-turno.controller';
import { CPCodigosTurnoService } from './codigos-turno.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPCodigosTurnoController],
  providers: [CPCodigosTurnoService],
  exports: [CPCodigosTurnoService],
})
export class CPCodigosTurnoModule {}
