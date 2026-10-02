import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { PersonalModule } from '../../personal/personal.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MailModule } from '../../mail/mail.module';
import { CPEntidadesModule } from '../entidades/entidades.module';
import { EntregasController } from './entregas.controller';
import { EntregasCronController } from './entregas-cron.controller';
import { EntregasService } from './entregas.service';
import { EntregasRecordatoriosService } from './entregas-recordatorios.service';

@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    PersonalModule,
    CPEntidadesModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [EntregasController, EntregasCronController],
  providers: [EntregasService, EntregasRecordatoriosService],
})
export class CPEntregasModule {}
