import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustodiasController } from './custodias.controller';
import { CustodiasConfigController } from './custodias-config.controller';
import { CustodiasConfigService } from './custodias-config.service';
import { CustodiasGuiaService } from './custodias-guia.service';
import { CustodiasClientesService } from './custodias-clientes.service';
import { CustodiasEnvioService } from './custodias-envio.service';
import { CustodiasSchemaService } from './custodias-schema.service';
import { CustodiasCampoSchemaService } from './custodias-campo-schema.service';
import { CustodiasNumeracionService } from './custodias-numeracion.service';
import { MailModule } from '../mail/mail.module';
import { VentasModule } from '../ventas/ventas.module';
import { CustodiasService } from './custodias.service';
import { PdfService } from './pdf.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustodiasPersonalService } from './custodias-personal.service';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { CustodiaArchivosService } from './custodia-archivos.storage';
import { CustodiasDispositivosService } from './custodias-dispositivos.service';
import { CustodiasCampoAuthService } from './custodias-campo-auth.service';
import { CustodiasCampoService } from './custodias-campo.service';
import { CustodiasCampoOficinaService } from './custodias-campo-oficina.service';
import { CustodiasEnlaceFotosService } from './custodias-enlace-fotos.service';
import { CampoDispositivoGuard, CampoSesionGuard } from './custodias-campo.guard';
import { CustodiasCampoController, CustodiasFotosPublicasController } from './custodias-campo.controller';
import { CustodiasOficinaCampoController } from './custodias-oficina-campo.controller';

@Module({
  // VentasModule: para crear clientes del Directorio desde la guía (VentasClientesService). MailModule: enviar la guía.
  imports: [PrismaModule, PermissionsModule, NotificationsModule, MailModule, VentasModule],
  // Los controladores de rutas fijas van antes que CustodiasController: sus rutas (config, rutas, campos, clientes,
  // dispositivos, pines, espacio, fotos, firmas, campo/*) no deben caer en `:id`. Los de campo y el enlace de fotos
  // son públicos (sin sesión de usuario): se identifican con el token del celular o del enlace.
  controllers: [
    CustodiasCampoController,
    CustodiasFotosPublicasController,
    CustodiasConfigController,
    CustodiasOficinaCampoController,
    CustodiasController,
  ],
  providers: [
    CustodiasService,
    CustodiasPersonalService,
    PdfService,
    CustodiasSchemaService,
    CustodiasCampoSchemaService,
    CustodiasNumeracionService,
    CustodiasConfigService,
    CustodiasGuiaService,
    CustodiasClientesService,
    CustodiasEnvioService,
    // Fase 2: el celular del custodio.
    GoogleAuthService,
    CustodiaArchivosService,
    CustodiasDispositivosService,
    CustodiasCampoAuthService,
    CustodiasCampoService,
    CustodiasCampoOficinaService,
    CustodiasEnlaceFotosService,
    CampoDispositivoGuard,
    CampoSesionGuard,
  ],
  exports: [CustodiasService],
})
export class CustodiasModule {}
