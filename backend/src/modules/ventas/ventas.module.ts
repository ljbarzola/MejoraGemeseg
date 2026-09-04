import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas-controller';
import { VentasWebhookController } from './ventas-webhook.controller';
import { VentasTemplatesController } from './ventas-templates.controller';
import { VentasTemplatesService } from './ventas-templates.service';
import { VentasContratosController } from './ventas-contratos.controller';
import { VentasContratosService } from './ventas-contratos.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    VentasController,
    VentasWebhookController,
    VentasTemplatesController,
    VentasContratosController,
  ],
  providers: [
    VentasService,
    VentasTemplatesService,
    VentasContratosService,
  ],
  exports: [VentasService, VentasTemplatesService, VentasContratosService],
})
export class VentasModule {}
