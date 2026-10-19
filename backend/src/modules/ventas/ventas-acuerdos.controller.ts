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
import { VentasAcuerdosService } from './ventas-acuerdos.service';
import { VentasRenovacionesService } from './ventas-renovaciones.service';
import {
  CancelSalesAgreementDto,
  CloseSalesAgreementDto,
  CreateAgreementIncidentDto,
  CreateSalesAgreementDto,
  CreateSalesServiceDto,
  LinkAgreementDocumentDto,
  RenewSalesAgreementDto,
  UpdateSalesAgreementDto,
  UpdateSalesServiceDto,
} from './dto/agreement.dto';

// "Contratos" de la pantalla de Ventas (SalesAgreement) y el catálogo de
// servicios que se les asigna. Las rutas fijas (documentos/..., servicios)
// van antes que `acuerdos/:id` para que no se lean como un id.
@Controller('ventas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasAcuerdosController {
  constructor(
    private readonly acuerdos: VentasAcuerdosService,
    private readonly renovaciones: VentasRenovacionesService,
  ) {}

  // ---- Catálogo de servicios ----

  @Get('servicios')
  @Section('VENTAS', 'view')
  listServices(
    @Req() req: any,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.acuerdos.listServices(
      req.user.companyId,
      incluirInactivos === 'true',
    );
  }

  @Post('servicios')
  @Section('VENTAS', 'write')
  createService(@Req() req: any, @Body() dto: CreateSalesServiceDto) {
    return this.acuerdos.createService(req.user.companyId, dto);
  }

  @Patch('servicios/:id')
  @Section('VENTAS', 'write')
  updateService(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesServiceDto,
  ) {
    return this.acuerdos.updateService(req.user.companyId, id, dto);
  }

  @Delete('servicios/:id')
  @Section('VENTAS', 'write')
  deleteService(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.acuerdos.deleteService(req.user.companyId, id);
  }

  // ---- Documentos antiguos sin cliente ----

  @Post('acuerdos/documentos/vincular-clientes')
  @Section('VENTAS', 'write')
  vincularDocumentosSinCliente(@Req() req: any) {
    return this.acuerdos.vincularDocumentosSinCliente(req.user.companyId);
  }

  // ---- Contratos ----

  @Get('acuerdos')
  @Section('VENTAS', 'view')
  list(
    @Req() req: any,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: string,
    @Query('servicioId') servicioId?: string,
    @Query('q') q?: string,
    @Query('tipo') tipo?: string,
  ) {
    return this.acuerdos.listAgreements(req.user.companyId, {
      kind: tipo || undefined,
      clientId: clienteId ? +clienteId || undefined : undefined,
      serviceId: servicioId ? +servicioId || undefined : undefined,
      estado: estado || undefined,
      q,
    });
  }

  @Post('acuerdos')
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() dto: CreateSalesAgreementDto) {
    return this.acuerdos.createAgreement(
      req.user.companyId,
      req.user.userId,
      dto,
    );
  }

  @Get('acuerdos/:id')
  @Section('VENTAS', 'view')
  get(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.acuerdos.getAgreement(req.user.companyId, id);
  }

  @Patch('acuerdos/:id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesAgreementDto,
  ) {
    return this.acuerdos.updateAgreement(
      req.user.companyId,
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete('acuerdos/:id')
  @Section('VENTAS', 'write')
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const resultado = await this.acuerdos.deleteAgreement(req.user.companyId, id);
    // Fase 4: sus oportunidades de renovación abiertas se van con él.
    await this.renovaciones.alEliminar(req.user.companyId, id);
    return resultado;
  }

  @Post('acuerdos/:id/cancelar')
  @Section('VENTAS', 'write')
  async cancel(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSalesAgreementDto,
  ) {
    const resultado = await this.acuerdos.cancelAgreement(
      req.user.companyId,
      req.user.userId,
      id,
      dto,
    );
    // Fase 4: un contrato cancelado ya no se renueva.
    await this.renovaciones.alCancelar(req.user.companyId, req.user.userId, id);
    return resultado;
  }

  @Post('acuerdos/:id/cierre')
  @Section('VENTAS', 'write')
  registrarCierre(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseSalesAgreementDto,
  ) {
    return this.acuerdos.registrarCierre(
      req.user.companyId,
      req.user.userId,
      id,
      dto.motivo,
    );
  }

  @Post('acuerdos/:id/incidentes')
  @Section('VENTAS', 'write')
  crearIncidente(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAgreementIncidentDto,
  ) {
    return this.acuerdos.crearIncidente(
      req.user.companyId,
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete('acuerdos/:id/incidentes/:incidenteId')
  @Section('VENTAS', 'write')
  borrarIncidente(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('incidenteId', ParseIntPipe) incidenteId: number,
  ) {
    return this.acuerdos.borrarIncidente(req.user.companyId, id, incidenteId);
  }

  @Post('acuerdos/:id/renovar')
  @Section('VENTAS', 'write')
  async renew(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewSalesAgreementDto,
  ) {
    const resultado = await this.acuerdos.renewAgreement(
      req.user.companyId,
      req.user.userId,
      id,
      dto,
    );
    // Fase 4: renovar a mano también cierra la oportunidad de renovación abierta.
    await this.renovaciones.alRenovarManual(req.user.companyId, req.user.userId, id);
    return resultado;
  }

  @Post('acuerdos/:id/documentos')
  @Section('VENTAS', 'write')
  linkDocument(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkAgreementDocumentDto,
  ) {
    return this.acuerdos.linkDocument(req.user.companyId, id, dto.contractId);
  }

  @Delete('acuerdos/:id/documentos/:contractId')
  @Section('VENTAS', 'write')
  unlinkDocument(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    return this.acuerdos.unlinkDocument(req.user.companyId, id, contractId);
  }
}
