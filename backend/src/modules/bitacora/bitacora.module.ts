import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AgentsModule } from '../agents/agents.module';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActividadInterceptor } from './actividad.interceptor';
import { BitacoraController } from './bitacora.controller';
import { BitacoraCronController } from './bitacora-cron.controller';
import { BitacoraExtensionController } from './bitacora-extension.controller';
import { ExtensionTokenGuard } from './bitacora-extension.guard';
import { BitacoraExtensionService } from './bitacora-extension.service';
import { BitacoraGoogleService } from './bitacora-google.service';
import { BitacoraHorasService } from './bitacora-horas.service';
import { BitacoraNotasService } from './bitacora-notas.service';
import { BitacoraResumenService } from './bitacora-resumen.service';
import { BitacoraService } from './bitacora.service';

@Module({
  // AgentsModule: el resumen del día es un agente trabajador (registro de actividad y apagado en Sistemas → Agentes).
  // VertexChatClient se provee aquí y no se importa AiModule entero: arrastraría Ventas y Personal.
  imports: [PrismaModule, PermissionsModule, NotificationsModule, AgentsModule],
  controllers: [
    BitacoraController,
    BitacoraCronController,
    BitacoraExtensionController,
  ],
  providers: [
    BitacoraService,
    BitacoraGoogleService,
    BitacoraExtensionService,
    BitacoraHorasService,
    BitacoraNotasService,
    BitacoraResumenService,
    VertexChatClient,
    GoogleAuthService,
    ExtensionTokenGuard,
    // Global: anota las acciones de toda la API (solo de empresas con la sección encendida).
    { provide: APP_INTERCEPTOR, useClass: ActividadInterceptor },
  ],
})
export class BitacoraModule {}
