import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AgentesAdminController } from './agentes-admin.controller';
import { AgentesHistorialService } from './agentes-historial.service';
import { AiProcessor } from './ai.processor';
import { AiVentasQueries } from './ai-ventas.queries';
import { AiVentasInvestigacionQueries } from './ai-ventas-investigacion.queries';
import { AiVentasPlanQueries } from './ai-ventas-plan.queries';
import { AiCacaoQueries } from './ai-cacao.queries';
import { CacaoConfigModule } from '../cacao/config/cacao-config.module';
import { VentasModule } from '../ventas/ventas.module';
import { VertexChatClient } from './vertex-chat.client';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { GoogleAuthService } from '../../common/services/google-auth.service';

@Module({
  // VentasModule: AiVentasQueries reutiliza el cálculo del Dashboard y la ficha
  // del cliente de VentasClientesService.
  // CacaoConfigModule: AiCacaoQueries lee las reglas de la empresa (monto de aprobación, pagos).
  imports: [PrismaModule, AuthModule, PermissionsModule, VentasModule, CacaoConfigModule],
  controllers: [AiController, AgentesAdminController],
  providers: [
    AiService,
    AgentesHistorialService,
    AiProcessor,
    AiVentasQueries,
    AiVentasInvestigacionQueries,
    AiVentasPlanQueries,
    AiCacaoQueries,
    VertexChatClient,
    GoogleAuthService,
  ],
  exports: [AiService],
})
export class AiModule {}
