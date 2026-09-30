import { Module } from '@nestjs/common';
import { CPContratosController } from './contratos.controller';
import { CPContratosService } from './contratos.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPContratosController],
  providers: [CPContratosService],
  exports: [CPContratosService],
})
export class CPContratosModule {}
