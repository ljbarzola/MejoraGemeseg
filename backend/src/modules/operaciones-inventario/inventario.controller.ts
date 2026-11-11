import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorInventario, InventarioService } from './inventario.service';
import {
  ActualizarArmaDto,
  ActualizarArticuloDto,
  AsignarArmaDto,
  CrearArmaDto,
  CrearArticuloDto,
  CrearMovimientoDto,
  ListarArmasQueryDto,
  ListarMovimientosQueryDto,
  MotivoArmaDto,
  TenenciasQueryDto,
} from './dto/inventario.dto';

const SECCION = 'OPERACIONES';

interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Inventario de Operaciones: uniformes, implementos, municiones (con kardex) y armas (por serie).
 * Ver = mirar existencias, movimientos y armas; escribir = registrar movimientos y armas.
 */
@Controller('operaciones/inventario')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class InventarioController {
  constructor(
    private readonly service: InventarioService,
    private readonly prisma: PrismaService,
  ) {}

  private async actor(req: AuthedRequest): Promise<ActorInventario> {
    const u = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fullName: true },
    });
    return { userId: req.user.userId, companyId: req.user.companyId, nombre: u?.fullName ?? req.user.email };
  }

  @Get('resumen')
  @Section(SECCION, 'view')
  resumen(@Req() req: AuthedRequest) {
    return this.service.resumen(req.user.companyId);
  }

  // ── Artículos ──
  @Get('articulos')
  @Section(SECCION, 'view')
  articulos(@Req() req: AuthedRequest) {
    return this.service.listarArticulos(req.user.companyId);
  }

  @Post('articulos')
  @Section(SECCION, 'write')
  crearArticulo(@Req() req: AuthedRequest, @Body() dto: CrearArticuloDto) {
    return this.service.crearArticulo(req.user.companyId, dto);
  }

  @Patch('articulos/:id')
  @Section(SECCION, 'write')
  actualizarArticulo(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarArticuloDto,
  ) {
    return this.service.actualizarArticulo(req.user.companyId, id, dto);
  }

  // ── Movimientos ──
  @Get('movimientos')
  @Section(SECCION, 'view')
  movimientos(@Req() req: AuthedRequest, @Query() q: ListarMovimientosQueryDto) {
    return this.service.listarMovimientos(req.user.companyId, q);
  }

  @Post('movimientos')
  @Section(SECCION, 'write')
  async registrarMovimiento(@Req() req: AuthedRequest, @Body() dto: CrearMovimientoDto) {
    return this.service.registrarMovimiento(await this.actor(req), dto);
  }

  @Get('tenencias')
  @Section(SECCION, 'view')
  tenencias(@Req() req: AuthedRequest, @Query() q: TenenciasQueryDto) {
    return this.service.tenencias(req.user.companyId, q.articuloId);
  }

  // ── Armas ──
  @Get('armas')
  @Section(SECCION, 'view')
  armas(@Req() req: AuthedRequest, @Query() q: ListarArmasQueryDto) {
    return this.service.listarArmas(req.user.companyId, q.estado);
  }

  @Post('armas')
  @Section(SECCION, 'write')
  async crearArma(@Req() req: AuthedRequest, @Body() dto: CrearArmaDto) {
    return this.service.crearArma(await this.actor(req), dto);
  }

  @Patch('armas/:id')
  @Section(SECCION, 'write')
  async actualizarArma(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarArmaDto,
  ) {
    return this.service.actualizarArma(await this.actor(req), id, dto);
  }

  @Get('armas/:id/eventos')
  @Section(SECCION, 'view')
  eventosArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.eventosArma(req.user.companyId, id);
  }

  @Post('armas/:id/asignar')
  @Section(SECCION, 'write')
  async asignarArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: AsignarArmaDto) {
    return this.service.asignarArma(await this.actor(req), id, dto);
  }

  @Post('armas/:id/devolver')
  @Section(SECCION, 'write')
  async devolverArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoArmaDto) {
    return this.service.devolverArma(await this.actor(req), id, dto.motivo);
  }

  @Post('armas/:id/mantenimiento')
  @Section(SECCION, 'write')
  async mantenimientoArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoArmaDto) {
    return this.service.cambiarEstadoArma(await this.actor(req), id, 'MANTENIMIENTO', dto.motivo);
  }

  @Post('armas/:id/reactivar')
  @Section(SECCION, 'write')
  async reactivarArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.cambiarEstadoArma(await this.actor(req), id, 'REACTIVAR');
  }

  @Post('armas/:id/baja')
  @Section(SECCION, 'write')
  async bajaArma(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoArmaDto) {
    return this.service.cambiarEstadoArma(await this.actor(req), id, 'BAJA', dto.motivo);
  }
}
