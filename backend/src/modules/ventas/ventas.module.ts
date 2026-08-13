import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas-controller';
import { VentasWebhookController } from './ventas-webhook.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VentasController, VentasWebhookController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
