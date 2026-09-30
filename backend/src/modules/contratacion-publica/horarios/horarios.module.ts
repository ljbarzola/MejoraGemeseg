import { Module } from '@nestjs/common';
import { CPHorariosController } from './horarios.controller';
import { CPHorariosService } from './horarios.service';
import { CPHorariosPdfService } from './horarios-pdf.service';
import { CPHorariosExcelService } from './horarios-excel.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { CPPuestosModule } from '../puestos/puestos.module';

@Module({
  imports: [PrismaModule, PermissionsModule, CPPuestosModule],
  controllers: [CPHorariosController],
  providers: [CPHorariosService, CPHorariosPdfService, CPHorariosExcelService],
  exports: [CPHorariosService],
})
export class CPHorariosModule {}
