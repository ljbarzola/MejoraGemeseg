import { Module } from '@nestjs/common';
import { CPPuestosController } from './puestos.controller';
import { CPPuestosService } from './puestos.service';
import { CPPatronRotacionService } from './patron-rotacion.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPPuestosController],
  providers: [CPPuestosService, CPPatronRotacionService],
  exports: [CPPuestosService, CPPatronRotacionService],
})
export class CPPuestosModule {}
