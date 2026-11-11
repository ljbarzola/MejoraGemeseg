import { Module } from '@nestjs/common';
import { CPHorariosController } from './horarios.controller';
import { CPHorariosService } from './horarios.service';
import { CPHorariosPdfService } from './horarios-pdf.service';
import { CPHorariosExcelService } from './horarios-excel.service';
import { CPHorariosImportarService } from './horarios-importar.service';
import { CPHorariosEjecutadoService } from './horarios-ejecutado.service';
import { ImportacionContratoService } from './importacion-contrato.service';
import { ImportacionContratoController } from './importacion-contrato.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { CPPuestosModule } from '../puestos/puestos.module';

@Module({
  imports: [PrismaModule, PermissionsModule, CPPuestosModule],
  controllers: [CPHorariosController, ImportacionContratoController],
  providers: [CPHorariosService, CPHorariosPdfService, CPHorariosExcelService, CPHorariosImportarService, CPHorariosEjecutadoService, ImportacionContratoService],
  exports: [CPHorariosService],
})
export class CPHorariosModule {}
