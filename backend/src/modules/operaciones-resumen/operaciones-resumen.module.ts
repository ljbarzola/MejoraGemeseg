import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { CPBitacorasModule } from '../contratacion-publica/bitacoras/bitacoras.module';
import { CPAusenciasModule } from '../contratacion-publica/ausencias/ausencias.module';
import { CPSupervisionModule } from '../contratacion-publica/supervision/supervision.module';
import { OperacionesInventarioModule } from '../operaciones-inventario/operaciones-inventario.module';
import { OperacionesPendientesService } from './operaciones-pendientes.service';
import { OperacionesResumenService } from './operaciones-resumen.service';
import { OperacionesResumenCronController } from './operaciones-resumen-cron.controller';

/**
 * Lo pendiente de Operaciones (2026-11-18): una pieza de lectura (`OperacionesPendientesService`)
 * que comparten el resumen diario por notificación en la app y el Agente de Operaciones del chat.
 * No crea tablas ni columnas: solo lee lo que ya existe.
 */
@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    NotificationsModule,
    MailModule,
    CPBitacorasModule,
    CPAusenciasModule,
    CPSupervisionModule,
    OperacionesInventarioModule,
  ],
  controllers: [OperacionesResumenCronController],
  providers: [OperacionesPendientesService, OperacionesResumenService],
  exports: [OperacionesPendientesService],
})
export class OperacionesResumenModule {}
