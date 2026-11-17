import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AiModule } from './modules/ai/ai.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { QueueModule } from './modules/queue/queue.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CacaoModule } from './modules/cacao/cacao.module';
import { CacheModule } from './modules/cache/cache.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { CustodiasModule } from './modules/custodias/custodias.module';
import { PersonalModule } from './modules/personal/personal.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { WhatsappBotModule } from './modules/whatsapp-bot/whatsapp-bot.module';
import { SistemasModule } from './modules/sistemas/sistemas.module';
import { ContratacionPublicaModule } from './modules/contratacion-publica/contratacion-publica.module';
import { OperacionesInventarioModule } from './modules/operaciones-inventario/operaciones-inventario.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BitacoraModule } from './modules/bitacora/bitacora.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CacheModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    AiModule,
    KnowledgeBaseModule,
    QueueModule,
    ToolsModule,
    AgentsModule,
    CompaniesModule,
    CacaoModule,
    PermissionsModule,
    CustodiasModule,
    PersonalModule,
    VentasModule,
    WhatsappBotModule,
    SistemasModule,
    ContratacionPublicaModule,
    OperacionesInventarioModule,
    NotificationsModule,
    BitacoraModule,
    ContabilidadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
