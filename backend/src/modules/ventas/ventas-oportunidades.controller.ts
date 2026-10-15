import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

// Oportunidades: cada negociación de un servicio de un cliente, con su propio
// embudo, monto cotizado y motivo de pérdida.
@Controller('ventas/oportunidades')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasOportunidadesController {
  constructor(private readonly oportunidades: VentasOportunidadesService) {}

  @Get()
  @Section('VENTAS', 'view')
  list(
    @Req() req: any,
    @Query('etapa') etapa?: string,
    @Query('responsableId') responsableId?: string,
    @Query('clienteId') clienteId?: string,
    @Query('servicioId') servicioId?: string,
    @Query('estado') estado?: string,
    @Query('q') q?: string,
  ) {
    return this.oportunidades.list(req.user.companyId, {
      etapa: etapa || undefined,
      responsableId: responsableId ? +responsableId || undefined : undefined,
      clienteId: clienteId ? +clienteId || undefined : undefined,
      servicioId: servicioId ? +servicioId || undefined : undefined,
      estado: estado || undefined,
      q,
    });
  }

  @Post()
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() dto: CreateOpportunityDto) {
    return this.oportunidades.create(req.user.companyId, req.user.userId, dto);
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  get(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.oportunidades.get(req.user.companyId, id);
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.oportunidades.update(req.user.companyId, id, dto);
  }

  @Patch(':id/etapa')
  @Section('VENTAS', 'write')
  cambiarEtapa(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeOpportunityStageDto,
  ) {
    return this.oportunidades.cambiarEtapa(
      req.user.companyId,
      id,
      dto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Section('VENTAS', 'write')
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.oportunidades.remove(req.user.companyId, id);
  }
}
