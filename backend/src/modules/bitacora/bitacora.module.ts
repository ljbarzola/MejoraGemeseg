import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActividadInterceptor } from './actividad.interceptor';
import { BitacoraController } from './bitacora.controller';
import { BitacoraCronController } from './bitacora-cron.controller';
import { BitacoraGoogleService } from './bitacora-google.service';
import { BitacoraService } from './bitacora.service';

@Module({
  imports: [PrismaModule, PermissionsModule, NotificationsModule],
  controllers: [BitacoraController, BitacoraCronController],
  providers: [
    BitacoraService,
    BitacoraGoogleService,
    // Global: anota las acciones de toda la API (solo de empresas con la sección encendida).
    { provide: APP_INTERCEPTOR, useClass: ActividadInterceptor },
  ],
})
export class BitacoraModule {}
