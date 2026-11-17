import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { CotActor, CotizadorCotizacionesService } from './cotizador-cotizaciones.service';
import { CotizadorOportunidadService } from './cotizador-oportunidad.service';

interface Peticion {
  user?: CotActor;
}

const actor = (req: Peticion): CotActor => ({
  userId: req.user!.userId,
  role: req.user!.role,
  companyId: req.user!.companyId,
});

const empresa = (req: Peticion): number => {
  const cid = req.user?.companyId;
  if (!cid) throw new BadRequestException('Se requiere una empresa');
  return cid;
};

/** Cotización ↔ oportunidad (2026-11-17). Ver cotizador-oportunidad.service.ts. */
@Controller('ventas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CotizadorOportunidadController {
  constructor(
    private readonly svc: CotizadorOportunidadService,
    private readonly cotizaciones: CotizadorCotizacionesService,
  ) {}

  /** Buscador del selector «Oportunidad» del Cotizador (solo abiertas). */
  @Get('cotizador/oportunidades')
  @Section('VENTAS', 'view')
  buscar(@Req() req: Peticion, @Query('q') q?: string) {
    return this.svc.buscar(empresa(req), q);
  }

  @Get('cotizador/oportunidades/:id')
  @Section('VENTAS', 'view')
  una(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    return this.svc.una(empresa(req), id);
  }

  @Get('cotizador/cotizaciones/:id/oportunidad')
  @Section('VENTAS', 'view')
  async deCotizacion(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    const { q } = await this.cotizaciones.cargar(actor(req), id);
    return this.svc.deCotizacion(q);
  }

  /** Body `{ opportunityId: number | null }` (null la quita). */
  @Put('cotizador/cotizaciones/:id/oportunidad')
  @Section('VENTAS', 'write')
  async unir(
    @Req() req: Peticion,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { opportunityId?: unknown },
  ) {
    const raw = body?.opportunityId;
    const opp = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (opp !== null && (!Number.isInteger(opp) || opp <= 0)) {
      throw new BadRequestException('Oportunidad no válida');
    }
    const a = actor(req);
    const { q, access } = await this.cotizaciones.cargar(a, id);
    return this.svc.unir(q, access, opp, a.userId);
  }

  /** Cotizaciones de una oportunidad (ficha de Oportunidades). */
  @Get('oportunidades/:id/cotizaciones')
  @Section('VENTAS', 'view')
  deOportunidad(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    const a = actor(req);
    return this.svc.deOportunidad(empresa(req), id, { userId: a.userId, role: a.role });
  }

  @Post('oportunidades/:id/cotizaciones/:quoteId/principal')
  @Section('VENTAS', 'write')
  async principal(
    @Req() req: Peticion,
    @Param('id', ParseIntPipe) id: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
  ) {
    const cid = empresa(req);
    await this.svc.marcarPrincipal(cid, id, quoteId);
    const a = actor(req);
    return this.svc.deOportunidad(cid, id, { userId: a.userId, role: a.role });
  }
}
