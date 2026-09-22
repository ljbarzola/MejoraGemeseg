import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas-controller';
import { VentasWebhookController } from './ventas-webhook.controller';
import { VentasTemplatesController } from './ventas-templates.controller';
import { VentasTemplatesService } from './ventas-templates.service';
import { VentasContratosController } from './ventas-contratos.controller';
import { VentasContratosService } from './ventas-contratos.service';
import { VentasClientesService } from './ventas-clientes.service';
import { VentasClientesController } from './ventas-clientes.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalModule } from '../personal/personal.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PersonalModule, PermissionsModule],
  controllers: [
    VentasController,
    VentasWebhookController,
    VentasTemplatesController,
    VentasContratosController,
    VentasClientesController,
  ],
  providers: [VentasService, VentasTemplatesService, VentasContratosService, VentasClientesService],
  exports: [VentasService, VentasTemplatesService, VentasContratosService, VentasClientesService],
})
export class VentasModule {}
