import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentsService } from './agents.service';
import { AgentRunService } from './agent-run.service';
import { DOCUMENTACION_AGENTES } from './agent-trabajadores.const';
import { modeloVertex } from '../../common/utils/vertex-endpoint.util';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

// Agentes de IA es una sub-pantalla de Sistemas (/sistemas/agentes), no una
// sección de permisos propia — por eso se gatea con SISTEMAS. Antes también
// exigía el rol ADMIN a secas (@Roles), lo que dejaba fuera a cualquier
// Employee/Manager con permiso de escritura en SISTEMAS — el mismo criterio
// que ya alcanza para el resto de las pantallas de Sistemas (Herramientas,
// Soporte). Se quitó ese requisito extra a propósito (2026-09-29): el control
// de acceso real es la sección SISTEMAS, no el rol de la cuenta.
@Controller('admin/agents')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly runs: AgentRunService,
  ) {}

  // Qué hace cada agente que trabaja solo y qué ha hecho (2026-10-18). Lo lee
  // Sistemas → Agentes; los datos de actividad son de la empresa de quien mira.
  @Get('docs')
  @Section('SISTEMAS', 'view')
  docs() {
    // El modelo se lee en cada pedido: cambia con las variables de entorno, no con el código.
    return DOCUMENTACION_AGENTES.map((d) => ({ ...d, modelo: modeloVertex('fuerte') }));
  }

  @Get('runs/summary')
  @Section('SISTEMAS', 'view')
  runsSummary(@Req() req: any, @Query('dias') dias?: string) {
    return this.runs.resumen(req.user.companyId ?? null, dias ? parseInt(dias, 10) || 30 : 30);
  }

  @Get('runs')
  @Section('SISTEMAS', 'view')
  runsList(
    @Req() req: any,
    @Query('agentId') agentId?: string,
    @Query('exito') exito?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.runs.listar(req.user.companyId ?? null, {
      agentId: agentId ? parseInt(agentId, 10) || undefined : undefined,
      exito: exito === 'true' ? true : exito === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
      offset: offset ? parseInt(offset, 10) || undefined : undefined,
    });
  }

  @Get()
  @Section('SISTEMAS', 'view')
  findAll() {
    return this.agentsService.findAll();
  }

  @Get('catalog')
  @Section('SISTEMAS', 'view')
  findAllAgents() {
    return this.agentsService.findAllAgents();
  }

  @Get('assignments')
  @Section('SISTEMAS', 'view')
  findAllAssignments() {
    return this.agentsService.findAllAssignments();
  }

  @Get('user/:userId')
  @Section('SISTEMAS', 'view')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.agentsService.findByUser(userId);
  }

  @Post()
  @Section('SISTEMAS', 'write')
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Patch(':id')
  @Section('SISTEMAS', 'write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Delete(':id')
  @Section('SISTEMAS', 'write')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agentsService.remove(id);
  }

  @Post(':id/assign/:userId')
  @Section('SISTEMAS', 'write')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.agentsService.assignToUser(id, userId);
  }

  @Delete(':id/assign/:userId')
  @Section('SISTEMAS', 'write')
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.agentsService.unassignFromUser(id, userId);
  }
}

@Controller('agents')
export class AgentsUserController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('available')
  @UseGuards(AuthGuard('jwt'))
  getAvailable(@Req() req: any) {
    return this.agentsService.getAvailableForUser(req.user.userId, req.user.companyId);
  }
}
