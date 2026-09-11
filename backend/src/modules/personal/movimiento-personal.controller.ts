import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { SistemaVerificacionService } from './services/sistema-verificacion.service';
import { MovimientoPersonalService } from './services/movimiento-personal.service';
import {
  CreateSistemaVerificacionDto,
  UpdateSistemaVerificacionDto,
} from './dto/sistema-verificacion.dto';
import {
  RegistrarMovimientoDto,
  UpdateMovimientoItemDto,
} from './dto/movimiento-personal.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class MovimientoPersonalController {
  constructor(
    private readonly sistemaVerificacionService: SistemaVerificacionService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
  ) {}

  // SISTEMAS DE VERIFICACIÓN (catálogo: IsyPlus, IESS, SUT, SICOSEP...)

  @Get('sistemas-verificacion')
  @Section('RRHH', 'view')
  findAllSistemas(@Req() req: any) {
    return this.sistemaVerificacionService.findAll(req.user.companyId);
  }

  @Post('sistemas-verificacion')
  @Section('RRHH', 'write')
  createSistema(@Body() body: CreateSistemaVerificacionDto, @Req() req: any) {
    return this.sistemaVerificacionService.create(req.user.companyId, body);
  }

  @Patch('sistemas-verificacion/:id')
  @Section('RRHH', 'write')
  updateSistema(
    @Param('id') id: string,
    @Body() body: UpdateSistemaVerificacionDto,
    @Req() req: any,
  ) {
    return this.sistemaVerificacionService.update(
      +id,
      req.user.companyId,
      body,
    );
  }

  @Delete('sistemas-verificacion/:id')
  @Section('RRHH', 'write')
  removeSistema(@Param('id') id: string, @Req() req: any) {
    return this.sistemaVerificacionService.remove(+id, req.user.companyId);
  }

  // MOVIMIENTOS DE PERSONAL (entrada/salida de guardias)

  @Get('movimientos')
  @Section('RRHH', 'view')
  findAllMovimientos(
    @Req() req: any,
    @Query('tipo') tipo?: string,
    @Query('estado') estado?: string,
    @Query('cedula') cedula?: string,
  ) {
    return this.movimientoPersonalService.findAll(req.user.companyId, {
      tipo,
      estado,
      cedula,
    });
  }

  @Get('movimientos/guardias-fuera')
  @Section('RRHH', 'view')
  getCedulasFuera(@Req() req: any) {
    return this.movimientoPersonalService.getCedulasFuera(req.user.companyId);
  }

  @Get('movimientos/:id')
  @Section('RRHH', 'view')
  findOneMovimiento(@Param('id') id: string, @Req() req: any) {
    return this.movimientoPersonalService.findOne(+id, req.user.companyId);
  }

  // No hay POST /movimientos/entrada: la entrada solo se crea automáticamente
  // desde CandidateService.move() (columna del kanban con triggersHire=true).
  // Movimientos de Personal es un registro, no un formulario de alta manual —
  // decisión explícita del usuario 2026-09-09 (ver .agents/modules/movimientos-personal.md).

  @Post('movimientos/salida')
  @Section('RRHH', 'write')
  registrarSalida(@Body() body: RegistrarMovimientoDto, @Req() req: any) {
    return this.movimientoPersonalService.crearSalida({
      cedula: body.cedula,
      nombreGuardia: body.nombreGuardia,
      companyId: req.user.companyId,
      userId: req.user.userId,
      origen: 'MANUAL_GUARDIAS_LIST',
    });
  }

  @Patch('movimientos/:id/items/:itemId')
  @Section('RRHH', 'write')
  toggleItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateMovimientoItemDto,
    @Req() req: any,
  ) {
    return this.movimientoPersonalService.toggleItem(
      +id,
      +itemId,
      body,
      req.user.companyId,
      req.user.userId,
    );
  }
}
