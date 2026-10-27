import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiService } from './ai.service';
import { AgentesHistorialService } from './agentes-historial.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

const entero = (v?: string) => (v ? parseInt(v, 10) || undefined : undefined);

// Sistemas → Agentes: lo que se les ha preguntado a los agentes de chat y su prompt real. Vive en el
// módulo de IA (no en el de agentes) porque necesita armar el prompt con el mismo código del chat.
// Mismo prefijo que AgentsController; las rutas no chocan con las suyas.
@Controller('admin/agents')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class AgentesAdminController {
  constructor(
    private readonly ai: AiService,
    private readonly historial: AgentesHistorialService,
  ) {}

  @Get('history/summary')
  @Section('SISTEMAS', 'view')
  resumen(@Req() req: any, @Query('dias') dias?: string) {
    return this.historial.resumen(req.user.companyId ?? null, entero(dias) ?? 30);
  }

  @Get('history')
  @Section('SISTEMAS', 'view')
  listar(
    @Req() req: any,
    @Query('agentId') agentId?: string,
    @Query('userId') userId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.historial.listar(req.user.companyId ?? null, {
      agentId: entero(agentId),
      userId: entero(userId),
      desde,
      hasta,
      limit: entero(limit),
      offset: entero(offset),
    });
  }

  @Get('prompt/:id')
  @Section('SISTEMAS', 'view')
  prompt(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ai.promptRealDeAgente(id, req.user.companyId ?? null);
  }
}
