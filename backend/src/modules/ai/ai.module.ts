import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';
import { AiVentasQueries } from './ai-ventas.queries';
import { VentasModule } from '../ventas/ventas.module';
import { VertexChatClient } from './vertex-chat.client';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { GoogleAuthService } from '../../common/services/google-auth.service';

@Module({
  // VentasModule: AiVentasQueries reutiliza el cálculo del Dashboard y la ficha
  // del cliente de VentasClientesService.
  imports: [PrismaModule, AuthModule, PermissionsModule, VentasModule],
  controllers: [AiController],
  providers: [AiService, AiProcessor, AiVentasQueries, VertexChatClient, GoogleAuthService],
  exports: [AiService],
})
export class AiModule {}
