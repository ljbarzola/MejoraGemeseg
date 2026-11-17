import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ContabilidadController } from './contabilidad.controller';
import { ContabilidadService } from './contabilidad.service';
import { NominaPdfService } from './nomina-pdf.service';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [ContabilidadController],
  providers: [ContabilidadService, NominaPdfService],
})
export class ContabilidadModule {}
