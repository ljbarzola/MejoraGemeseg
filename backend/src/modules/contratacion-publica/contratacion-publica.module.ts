import { Module } from '@nestjs/common';
import { CPEntidadesModule } from './entidades/entidades.module';
import { CPContratosModule } from './contratos/contratos.module';
import { CPPuestosModule } from './puestos/puestos.module';
import { CPCodigosTurnoModule } from './codigos-turno/codigos-turno.module';
import { CPHorariosModule } from './horarios/horarios.module';
import { CPInformesModule } from './informes/informes.module';
import { CPTextosInstitucionalesModule } from './textos-institucionales/textos-institucionales.module';

@Module({
  imports: [
    CPEntidadesModule,
    CPContratosModule,
    CPPuestosModule,
    CPCodigosTurnoModule,
    CPHorariosModule,
    CPInformesModule,
    CPTextosInstitucionalesModule,
  ],
})
export class ContratacionPublicaModule {}
