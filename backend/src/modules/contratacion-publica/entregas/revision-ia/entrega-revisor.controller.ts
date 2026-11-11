import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../../common/guards/section-permission.guard';
import { Section } from '../../../../common/decorators/section.decorator';
import { PermissionsService } from '../../../permissions/permissions.service';
import type { Actor } from '../entregas.service';
import { EntregaRevisorService } from './entrega-revisor.service';

const SECCION = 'CONTRATACION_PUBLICA';

interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Nota del Agente Revisor de Entregas sobre cada documento entregado. Quien entrega la dispara
 * (con «ver» basta, si el documento es suyo) pero solo el personal de Contratación Pública
 * (con «escribir») ve lo que el agente dijo.
 */
@Controller('contratacion-publica/entregas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class EntregaRevisorController {
  constructor(
    private readonly revisor: EntregaRevisorService,
    private readonly permissions: PermissionsService,
  ) {}

  private async actor(req: AuthedRequest): Promise<Actor> {
    return {
      userId: req.user.userId,
      companyId: req.user.companyId,
      puedeEscribir: await this.permissions.hasSectionAccess(req.user, SECCION, 'write'),
    };
  }

  // Estados de varios documentos (para la lista de «Por aprobar»): ?ids=1,2,3
  @Get('revision-ia')
  @Section(SECCION, 'write')
  async listar(@Query('ids') ids: string | undefined, @Req() req: AuthedRequest) {
    const lista = (ids ?? '')
      .split(',')
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    return this.revisor.listar(lista, await this.actor(req));
  }

  @Get('documentos/:id/revision-ia')
  @Section(SECCION, 'write')
  async obtener(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return { revision: await this.revisor.obtener(id, await this.actor(req)) };
  }

  @Post('documentos/:id/revision-ia')
  @Section(SECCION, 'view')
  async revisar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { volver?: boolean } | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.revisor.revisar(id, await this.actor(req), body?.volver === true);
  }
}
