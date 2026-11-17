import {
  BadRequestException,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CotizadorCatalogoService } from './cotizador-catalogo.service';
import {
  CatalogoLoteDto,
  CotLimitesDto,
  CotKitDto,
  CotTemplateDto,
  CreateCotInstallDto,
  CreateCotProductDto,
  UpdateCotInstallDto,
  UpdateCotKitDto,
  UpdateCotProductDto,
  UpdateCotTemplateDto,
} from './dto/cotizador.dto';
import { CotCounterKind } from './cotizador.util';

const TIPOS: CotCounterKind[] = [
  'EQUIPO',
  'MATERIAL',
  'SERVICIO',
  'INSTALACION',
];

// Catálogo del Cotizador (Ventas y CRM). Las rutas fijas van antes que las de `:id`.
@Controller('ventas/cotizador')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CotizadorCatalogoController {
  constructor(
    private readonly catalogo: CotizadorCatalogoService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('catalogo')
  @Section('VENTAS', 'view')
  obtener(
    @Req() req: any,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.catalogo.catalogo(
      req.user.companyId,
      incluirInactivos === 'true',
    );
  }

  @Get('siguiente-codigo')
  @Section('VENTAS', 'view')
  siguienteCodigo(@Req() req: any, @Query('tipo') tipo: string) {
    if (!TIPOS.includes(tipo as CotCounterKind))
      throw new BadRequestException('Tipo no válido');
    return this.catalogo.siguienteCodigo(
      req.user.companyId,
      tipo as CotCounterKind,
    );
  }

  // Historial general de cambios del catálogo (solo lectura, lo ve quien ve el Cotizador)
  @Get('historial')
  @Section('VENTAS', 'view')
  historial(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('tipo') tipo?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('userId') userId?: string,
    @Query('pagina') pagina?: string,
    @Query('limite') limite?: string,
  ) {
    const num = (v?: string) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined);
    return this.catalogo.historial(req.user.companyId, {
      q,
      tipo,
      desde,
      hasta,
      userId: num(userId),
      pagina: num(pagina),
      limite: num(limite),
    });
  }

  @Get('historial/personas')
  @Section('VENTAS', 'view')
  personasHistorial(@Req() req: any) {
    return this.catalogo.personasHistorial(req.user.companyId);
  }

  // Límites de precio de la empresa. Los ve quien usa el Cotizador (para mostrar los avisos);
  // solo administradores y gerentes los cambian.
  @Get('limites')
  @Section('VENTAS', 'view')
  limites(@Req() req: any) {
    return this.catalogo.obtenerLimites(req.user.companyId);
  }

  @Put('limites')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'write')
  guardarLimites(@Req() req: any, @Body() dto: CotLimitesDto) {
    return this.catalogo.guardarLimites(
      req.user.companyId,
      dto,
      req.user.userId,
    );
  }

  @Post('catalogo/lote')
  @Section('VENTAS', 'write')
  lote(@Req() req: any, @Body() dto: CatalogoLoteDto) {
    return this.catalogo.lote(req.user.companyId, dto, req.user.userId);
  }

  // ---- Productos ----

  @Post('productos')
  @Section('VENTAS', 'write')
  crearProducto(@Req() req: any, @Body() dto: CreateCotProductDto) {
    return this.catalogo.crearProducto(req.user.companyId, dto, req.user.userId);
  }

  @Patch('productos/:id')
  @Section('VENTAS', 'write')
  actualizarProducto(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotProductDto,
  ) {
    return this.catalogo.actualizarProducto(
      req.user.companyId,
      id,
      dto,
      req.user.userId,
    );
  }

  // "Eliminar" desactiva el producto: las cotizaciones que lo usaron no se tocan.
  @Delete('productos/:id')
  @Section('VENTAS', 'write')
  desactivarProducto(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.catalogo.desactivarProducto(
      req.user.companyId,
      id,
      req.user.userId,
    );
  }

  // ---- Servicios de instalación ----

  @Post('instalaciones')
  @Section('VENTAS', 'write')
  crearInstalacion(@Req() req: any, @Body() dto: CreateCotInstallDto) {
    return this.catalogo.crearInstalacion(
      req.user.companyId,
      dto,
      req.user.userId,
    );
  }

  @Patch('instalaciones/:id')
  @Section('VENTAS', 'write')
  actualizarInstalacion(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotInstallDto,
  ) {
    return this.catalogo.actualizarInstalacion(
      req.user.companyId,
      id,
      dto,
      req.user.userId,
    );
  }

  @Delete('instalaciones/:id')
  @Section('VENTAS', 'write')
  desactivarInstalacion(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.catalogo.desactivarInstalacion(
      req.user.companyId,
      id,
      req.user.userId,
    );
  }

  // ---- Kits ----

  @Get('kits')
  @Section('VENTAS', 'view')
  listarKits(@Req() req: any) {
    return this.catalogo.listarKits(req.user.companyId);
  }

  @Post('kits')
  @Section('VENTAS', 'write')
  crearKit(@Req() req: any, @Body() dto: CotKitDto) {
    return this.catalogo.crearKit(req.user.companyId, req.user.userId, dto);
  }

  @Patch('kits/:id')
  @Section('VENTAS', 'write')
  actualizarKit(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotKitDto,
  ) {
    return this.catalogo.actualizarKit(req.user.companyId, id, dto);
  }

  @Delete('kits/:id')
  @Section('VENTAS', 'write')
  eliminarKit(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.catalogo.eliminarKit(req.user.companyId, id);
  }

  // ---- Plantillas ----

  @Get('plantillas')
  @Section('VENTAS', 'view')
  listarPlantillas(@Req() req: any) {
    return this.catalogo.listarPlantillas(req.user.companyId);
  }

  @Post('plantillas')
  @Section('VENTAS', 'write')
  async crearPlantilla(@Req() req: any, @Body() dto: CotTemplateDto) {
    const u = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fullName: true },
    });
    return this.catalogo.crearPlantilla(
      req.user.companyId,
      { userId: req.user.userId, fullName: u?.fullName ?? '' },
      dto,
    );
  }

  @Patch('plantillas/:id')
  @Section('VENTAS', 'write')
  actualizarPlantilla(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotTemplateDto,
  ) {
    return this.catalogo.actualizarPlantilla(req.user.companyId, id, dto);
  }

  @Delete('plantillas/:id')
  @Section('VENTAS', 'write')
  eliminarPlantilla(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.catalogo.eliminarPlantilla(req.user.companyId, id);
  }
}
