import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AiModule } from './modules/ai/ai.module';
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

@Module({
  imports: [
    CacheModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    AiModule,
    QueueModule,
    ToolsModule,
    AgentsModule,
    CompaniesModule,
    CacaoModule,
    PermissionsModule,
    CustodiasModule,
    PersonalModule,
    VentasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
