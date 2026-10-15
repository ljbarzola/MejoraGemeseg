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
import { VentasAcuerdosService } from './ventas-acuerdos.service';
import { VentasSchemaService } from './ventas-schema.service';
import { VentasMotivosService } from './ventas-motivos.service';
import { VentasMotivosController } from './ventas-motivos.controller';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import { VentasCicloService } from './ventas-ciclo.service';
import { VentasAnaliticaService } from './ventas-analitica.service';
import { VentasLeadsService } from './ventas-leads.service';
import { VentasExpedienteService } from './ventas-expediente.service';
import { VentasLeadsController } from './ventas-leads.controller';
import { VentasConversionesService } from './ventas-conversiones.service';
import { VentasConversionesController } from './ventas-conversiones.controller';
import { VentasConversionesCronController } from './ventas-conversiones-cron.controller';
import { GoogleAdsConversionesService } from './google-ads-conversiones.service';
import { VentasAnaliticaController } from './ventas-analitica.controller';
import { VentasOportunidadesController } from './ventas-oportunidades.controller';
import { VentasAcuerdosController } from './ventas-acuerdos.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalModule } from '../personal/personal.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    PersonalModule,
    PermissionsModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [
    VentasController,
    VentasWebhookController,
    VentasTemplatesController,
    VentasContratosController,
    VentasClientesController,
    VentasAcuerdosController,
    VentasMotivosController,
    VentasOportunidadesController,
    VentasAnaliticaController,
    VentasLeadsController,
    VentasConversionesController,
    VentasConversionesCronController,
  ],
  providers: [
    VentasService,
    VentasTemplatesService,
    VentasContratosService,
    VentasClientesService,
    VentasAcuerdosService,
    VentasSchemaService,
    VentasMotivosService,
    VentasOportunidadesService,
    VentasCicloService,
    VentasAnaliticaService,
    VentasLeadsService,
    VentasExpedienteService,
    VentasConversionesService,
    GoogleAdsConversionesService,
  ],
  exports: [
    VentasExpedienteService,
    VentasAnaliticaService,
    VentasOportunidadesService,
    VentasService,
    VentasTemplatesService,
    VentasContratosService,
    VentasClientesService,
  ],
})
export class VentasModule {}
