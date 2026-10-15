import {
  Body,
  Controller,
  Delete,
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
import {
  CotActor,
  CotizadorCotizacionesService,
} from './cotizador-cotizaciones.service';
import {
  ChangeCotStatusDto,
  CreateCotQuoteDto,
  EditGrantDto,
  ShareCotQuoteDto,
  UpdateCotQuoteDto,
} from './dto/cotizador.dto';

const actor = (req: any): CotActor => ({
  userId: req.user.userId,
  role: req.user.role,
  companyId: req.user.companyId,
});

// Cotizaciones del Cotizador. Las rutas fijas (siguiente-numero, accesos-edicion,
// usuarios) van antes que `cotizaciones/:id`.
@Controller('ventas/cotizador')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CotizadorCotizacionesController {
  constructor(private readonly cotizaciones: CotizadorCotizacionesService) {}

  @Get('usuarios')
  @Section('VENTAS', 'view')
  usuarios(@Req() req: any) {
    return this.cotizaciones.usuarios(actor(req));
  }

  @Get('accesos-edicion')
  @Section('VENTAS', 'view')
  accesos(@Req() req: any) {
    return this.cotizaciones.accesosEdicion(actor(req));
  }

  @Post('accesos-edicion')
  @Section('VENTAS', 'write')
  darAcceso(@Req() req: any, @Body() dto: EditGrantDto) {
    return this.cotizaciones.darAccesoEdicion(actor(req), dto.userId);
  }

  @Delete('accesos-edicion/:userId')
  @Section('VENTAS', 'write')
  quitarAcceso(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.cotizaciones.quitarAccesoEdicion(actor(req), userId);
  }

  @Get('cotizaciones')
  @Section('VENTAS', 'view')
  listar(@Req() req: any) {
    return this.cotizaciones.listar(actor(req));
  }

  @Get('cotizaciones/siguiente-numero')
  @Section('VENTAS', 'view')
  siguienteNumero(@Req() req: any, @Query('fecha') fecha?: string) {
    return this.cotizaciones.siguienteNumero(actor(req), fecha);
  }

  @Get('cotizaciones/verificar-numero')
  @Section('VENTAS', 'view')
  verificarNumero(
    @Req() req: any,
    @Query('numero') numero: string,
    @Query('excluir') excluir?: string,
  ) {
    return this.cotizaciones.verificarNumero(
      actor(req),
      (numero ?? '').trim(),
      excluir ? parseInt(excluir, 10) || undefined : undefined,
    );
  }

  @Post('cotizaciones')
  @Section('VENTAS', 'write')
  crear(@Req() req: any, @Body() dto: CreateCotQuoteDto) {
    return this.cotizaciones.crear(actor(req), dto);
  }

  @Get('cotizaciones/:id')
  @Section('VENTAS', 'view')
  obtener(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.cotizaciones.obtener(actor(req), id);
  }

  @Patch('cotizaciones/:id')
  @Section('VENTAS', 'write')
  actualizar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotQuoteDto,
  ) {
    return this.cotizaciones.actualizar(actor(req), id, dto);
  }

  @Patch('cotizaciones/:id/estado')
  @Section('VENTAS', 'write')
  estado(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeCotStatusDto,
  ) {
    return this.cotizaciones.cambiarEstado(actor(req), id, dto);
  }

  @Delete('cotizaciones/:id')
  @Section('VENTAS', 'write')
  eliminar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.cotizaciones.eliminar(actor(req), id);
  }

  @Post('cotizaciones/:id/copiar')
  @Section('VENTAS', 'write')
  copiar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.cotizaciones.copiar(actor(req), id);
  }

  @Get('cotizaciones/:id/compartidos')
  @Section('VENTAS', 'view')
  compartidos(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.cotizaciones.compartidos(actor(req), id);
  }

  @Post('cotizaciones/:id/compartir')
  @Section('VENTAS', 'write')
  compartir(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ShareCotQuoteDto,
  ) {
    return this.cotizaciones.compartir(actor(req), id, dto.userId);
  }

  @Delete('cotizaciones/:id/compartir/:userId')
  @Section('VENTAS', 'write')
  quitarComparticion(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.cotizaciones.quitarComparticion(actor(req), id, userId);
  }
}
