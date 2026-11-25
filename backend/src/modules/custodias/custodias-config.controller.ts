import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { CustodiasConfigService } from './custodias-config.service';
import { CustodiasClientesService } from './custodias-clientes.service';
import {
  ActivoDto,
  CampoDto,
  CrearClienteDirectorioDto,
  FirmaClienteDto,
  OrdenCamposDto,
  RutaDto,
  UpdateCustodiasConfigDto,
} from './dto/custodias-config.dto';

/**
 * Configuración de las custodias en campo (2026-11-24): firmas, rutas, campos de la guía y correo, más el acceso
 * a los clientes del Directorio. Va declarado ANTES que CustodiasController en el módulo para que estas rutas
 * fijas no las capture `GET /custodias/:id`. Los permisos son los de la sección OPERACIONES (Custodias no tiene
 * sección propia).
 */
@Controller('custodias')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CustodiasConfigController {
  constructor(
    private readonly config: CustodiasConfigService,
    private readonly clientes: CustodiasClientesService,
  ) {}

  private empresa(req: any): number {
    return this.config.exigirEmpresa(req.user.companyId);
  }

  // ───── Firmas y correo ─────

  @Get('config')
  @Section('OPERACIONES', 'view')
  getConfig(@Req() req: any) {
    return this.config.getConfig(this.empresa(req));
  }

  @Put('config')
  @Section('OPERACIONES', 'write')
  updateConfig(@Body() dto: UpdateCustodiasConfigDto, @Req() req: any) {
    return this.config.updateConfig(this.empresa(req), dto);
  }

  @Put('config/firmas-cliente/:salesClientId')
  @Section('OPERACIONES', 'write')
  guardarFirmaCliente(
    @Param('salesClientId', ParseIntPipe) salesClientId: number,
    @Body() dto: FirmaClienteDto,
    @Req() req: any,
  ) {
    return this.config.guardarFirmaCliente(this.empresa(req), salesClientId, dto.firmaMomento);
  }

  @Delete('config/firmas-cliente/:salesClientId')
  @Section('OPERACIONES', 'write')
  quitarFirmaCliente(@Param('salesClientId', ParseIntPipe) salesClientId: number, @Req() req: any) {
    return this.config.quitarFirmaCliente(this.empresa(req), salesClientId);
  }

  // ───── Rutas ─────

  @Get('rutas')
  @Section('OPERACIONES', 'view')
  listarRutas(@Req() req: any, @Query('incluirInactivas') incluirInactivas?: string) {
    return this.config.listarRutas(this.empresa(req), incluirInactivas === 'true');
  }

  @Post('rutas')
  @Section('OPERACIONES', 'write')
  crearRuta(@Body() dto: RutaDto, @Req() req: any) {
    return this.config.crearRuta(this.empresa(req), dto);
  }

  @Put('rutas/:id')
  @Section('OPERACIONES', 'write')
  actualizarRuta(@Param('id', ParseIntPipe) id: number, @Body() dto: RutaDto, @Req() req: any) {
    return this.config.actualizarRuta(this.empresa(req), id, dto);
  }

  @Patch('rutas/:id/activo')
  @Section('OPERACIONES', 'write')
  activarRuta(@Param('id', ParseIntPipe) id: number, @Body() dto: ActivoDto, @Req() req: any) {
    return this.config.activarRuta(this.empresa(req), id, dto.activo);
  }

  // ───── Campos de la guía ─────

  @Get('campos')
  @Section('OPERACIONES', 'view')
  listarCampos(@Req() req: any, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.config.listarCampos(this.empresa(req), incluirInactivos === 'true');
  }

  @Post('campos')
  @Section('OPERACIONES', 'write')
  crearCampo(@Body() dto: CampoDto, @Req() req: any) {
    return this.config.crearCampo(this.empresa(req), dto);
  }

  // `orden` va antes que `:id`: si no, Nest lo tomaría por un id.
  @Put('campos/orden')
  @Section('OPERACIONES', 'write')
  ordenarCampos(@Body() dto: OrdenCamposDto, @Req() req: any) {
    return this.config.ordenarCampos(this.empresa(req), dto.ids);
  }

  @Put('campos/:id')
  @Section('OPERACIONES', 'write')
  actualizarCampo(@Param('id', ParseIntPipe) id: number, @Body() dto: CampoDto, @Req() req: any) {
    return this.config.actualizarCampo(this.empresa(req), id, dto);
  }

  @Patch('campos/:id/activo')
  @Section('OPERACIONES', 'write')
  activarCampo(@Param('id', ParseIntPipe) id: number, @Body() dto: ActivoDto, @Req() req: any) {
    return this.config.activarCampo(this.empresa(req), id, dto.activo);
  }

  // ───── Clientes del Directorio ─────

  @Get('clientes')
  @Section('OPERACIONES', 'view')
  buscarClientes(@Req() req: any, @Query('buscar') buscar?: string) {
    return this.clientes.buscar(req.user.companyId, buscar);
  }

  @Post('clientes')
  @Section('OPERACIONES', 'write')
  crearCliente(@Body() dto: CrearClienteDirectorioDto, @Req() req: any) {
    return this.clientes.crear(req.user.companyId, req.user.userId, dto);
  }
}
