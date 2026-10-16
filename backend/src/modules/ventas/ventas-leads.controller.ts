import {
  Controller,
  Get,
  Post,
  Patch,
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
import { VentasLeadsService } from './ventas-leads.service';
import {
  ConvertLeadDto,
  CreateLeadDto,
  DiscardLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';

// Bandeja de Leads (contactos entrantes sin calificar). La ruta es
// /ventas/entrantes porque /ventas/leads ya la usa el módulo viejo de
// prospectos (apagado en pantalla, con su propia tabla).
@Controller('ventas/entrantes')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasLeadsController {
  constructor(private readonly leads: VentasLeadsService) {}

  @Get()
  @Section('VENTAS', 'view')
  list(
    @Req() req: any,
    @Query('estado') estado?: string,
    @Query('canal') canal?: string,
    @Query('motivo') motivo?: string,
    @Query('q') q?: string,
  ) {
    return this.leads.list(req.user.companyId, {
      estado: estado || undefined,
      canal: canal || undefined,
      motivo: motivo || undefined,
      q,
    });
  }

  // Antes de `:id`, para que «canales» no se lea como un número.
  @Get('canales')
  @Section('VENTAS', 'view')
  canales() {
    return this.leads.canales();
  }

  @Get('canales/actividad')
  @Section('VENTAS', 'view')
  actividadCanales(@Req() req: any) {
    return this.leads.actividadCanales(req.user.companyId);
  }

  @Post()
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() dto: CreateLeadDto) {
    return this.leads.crearManual(req.user.companyId, req.user.userId, dto);
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  get(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.leads.get(req.user.companyId, id);
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.actualizar(req.user.companyId, id, dto);
  }

  @Post(':id/tomar')
  @Section('VENTAS', 'write')
  tomar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.leads.tomar(req.user.companyId, id, req.user.userId);
  }

  @Post(':id/soltar')
  @Section('VENTAS', 'write')
  soltar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.leads.soltar(req.user.companyId, id, req.user.userId);
  }

  @Post(':id/descartar')
  @Section('VENTAS', 'write')
  descartar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiscardLeadDto,
  ) {
    return this.leads.descartar(req.user.companyId, id, req.user.userId, dto.motivo);
  }

  @Post(':id/convertir')
  @Section('VENTAS', 'write')
  convertir(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leads.convertir(req.user.companyId, id, req.user.userId, dto);
  }
}
