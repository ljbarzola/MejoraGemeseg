import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { PersonalModule } from '../../personal/personal.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MailModule } from '../../mail/mail.module';
import { AgentsModule } from '../../agents/agents.module';
import { GoogleAuthService } from '../../../common/services/google-auth.service';
import { CPEntidadesModule } from '../entidades/entidades.module';
import { EntregasController } from './entregas.controller';
import { EntregasCronController } from './entregas-cron.controller';
import { EntregasService } from './entregas.service';
import { EntregasRecordatoriosService } from './entregas-recordatorios.service';
import { EntregaLectorService } from './revision-ia/entrega-lector.service';
import { EntregaRevisorService } from './revision-ia/entrega-revisor.service';
import { EntregaRevisorController } from './revision-ia/entrega-revisor.controller';

@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    PersonalModule,
    CPEntidadesModule,
    NotificationsModule,
    MailModule,
    AgentsModule,
  ],
  controllers: [EntregasController, EntregasCronController, EntregaRevisorController],
  providers: [
    EntregasService,
    EntregasRecordatoriosService,
    EntregaLectorService,
    EntregaRevisorService,
    GoogleAuthService,
  ],
})
export class CPEntregasModule {}
