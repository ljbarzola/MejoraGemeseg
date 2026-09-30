import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasClientesService } from './ventas-clientes.service';
import {
  CreateSalesClientDto,
  UpdateSalesClientDto,
  CreateSalesClientFieldDto,
  UpdateSalesClientFieldDto,
  CreateReferralDto,
  ChangeSalesClientStageDto,
  CreateSalesClientStageDto,
  UpdateSalesClientStageDto,
} from './dto/client.dto';

@Controller('ventas/clientes')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasClientesController {
  constructor(private readonly clientesService: VentasClientesService) {}

  // Sin @Section a propósito: cualquier empleado autenticado debe poder
  // referir un cliente potencial, tenga o no acceso al módulo Ventas (mismo
  // motivo que Buzón de Quejas / Sistemas-tickets).
  @Post('referir')
  referir(@Req() req: any, @Body() dto: CreateReferralDto) {
    return this.clientesService.createReferral(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  // Tampoco lleva @Section: es la bandeja de "lo que yo he referido", propia
  // de cualquier usuario, no la gestión de Ventas.
  @Get('mis-referidos')
  misReferidos(@Req() req: any) {
    return this.clientesService.listMyReferrals(
      req.user.userId,
      req.user.companyId,
    );
  }

  // El GET no lleva @Section: el formulario abierto de "Referir un cliente"
  // necesita poder leer las opciones de "Servicio requerido" sin tener
  // acceso a Ventas (mismo patrón que complaint-fields).
  @Get('fields')
  listFields(@Req() req: any) {
    return this.clientesService.listFields(req.user.companyId);
  }

  @Post('fields')
  @Section('VENTAS', 'write')
  addField(@Req() req: any, @Body() dto: CreateSalesClientFieldDto) {
    return this.clientesService.addField(req.user.companyId, dto);
  }

  @Patch('fields/:id')
  @Section('VENTAS', 'write')
  updateField(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalesClientFieldDto,
  ) {
    return this.clientesService.updateField(req.user.companyId, +id, dto);
  }

  @Delete('fields/:id')
  @Section('VENTAS', 'write')
  deleteField(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.deleteField(req.user.companyId, +id);
  }

  // Etapas del pipeline. GET sin @Section: "Mis Referidos" necesita poder
  // leer labels/colores de las etapas.
  @Get('stages')
  listStages(@Req() req: any) {
    return this.clientesService.listStages(req.user.companyId);
  }

  @Post('stages')
  @Section('VENTAS', 'write')
  createStage(@Req() req: any, @Body() dto: CreateSalesClientStageDto) {
    return this.clientesService.createStage(req.user.companyId, dto);
  }

  @Patch('stages/:id')
  @Section('VENTAS', 'write')
  updateStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalesClientStageDto,
  ) {
    return this.clientesService.updateStage(+id, req.user.companyId, dto);
  }

  @Delete('stages/:id')
  @Section('VENTAS', 'write')
  deleteStage(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.deleteStage(+id, req.user.companyId);
  }

  @Patch(':id/stage')
  @Section('VENTAS', 'write')
  changeStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeSalesClientStageDto,
  ) {
    return this.clientesService.changeStage(
      +id,
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  // "Responsable" (quién de Ventas atiende la venta) — cada quien se
  // auto-asigna/desasigna, nadie asigna el cliente de otra persona desde acá.
  @Post(':id/asignarme')
  @Section('VENTAS', 'write')
  asignarme(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.asignarme(
      req.user.companyId,
      +id,
      req.user.userId,
    );
  }

  @Delete(':id/asignarme')
  @Section('VENTAS', 'write')
  quitarme(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.quitarme(
      req.user.companyId,
      +id,
      req.user.userId,
    );
  }

  @Get()
  @Section('VENTAS', 'view')
  list(@Req() req: any) {
    return this.clientesService.listClients(req.user.companyId);
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.getClient(req.user.companyId, +id);
  }

  @Post()
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() dto: CreateSalesClientDto) {
    return this.clientesService.createClient(
      req.user.companyId,
      req.user.userId,
      dto,
    );
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalesClientDto,
  ) {
    return this.clientesService.updateClient(req.user.companyId, +id, dto);
  }

  @Delete(':id')
  @Section('VENTAS', 'write')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.deleteClient(req.user.companyId, +id);
  }
}
