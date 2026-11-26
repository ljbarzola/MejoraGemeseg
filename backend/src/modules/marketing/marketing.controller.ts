import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';
import { Section } from '../../common/decorators/section.decorator';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { MarketingService } from './marketing.service';
import { MarketingCrecimientoService } from './marketing-crecimiento.service';
import { ArchivoGrandeFilter } from './marketing-upload.filter';
import {
  ClasificarCanalExtraDto,
  ConexionDto,
  CreateCampaignDto,
  FechaPiezaDto,
  GenerarImagenDto,
  PublicarEnvioDto,
  RadarDto,
  RecursoDto,
  RegenerarDto,
  RequerimientoDto,
  SiguientePreguntaDto,
  SugerirCanalesDto,
  UpdateMarketingSettingDto,
  UpdatePieceDto,
} from './dto/create-campaign.dto';

@Controller('marketing')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class MarketingController {
  constructor(
    private readonly service: MarketingService,
    private readonly crecimiento: MarketingCrecimientoService,
  ) {}

  private empresa(req: any): number {
    if (!req.user.companyId) {
      throw new BadRequestException('Entra con un usuario de una empresa para usar Marketing.');
    }
    return req.user.companyId;
  }

  @Get('configuracion')
  @Section('MARKETING', 'view')
  configuracion(@Req() req: any) {
    return this.service.obtenerConfiguracion(this.empresa(req));
  }

  @Put('configuracion')
  @Section('MARKETING', 'write')
  guardarConfiguracion(@Req() req: any, @Body() dto: UpdateMarketingSettingDto) {
    return this.service.guardarSetting(this.empresa(req), dto);
  }

  /** Lee el sitio web guardado y guarda un resumen hecho por la IA (`resumenWeb`). */
  @Post('configuracion/leer-web')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  leerWeb(@Req() req: any) {
    return this.service.leerWeb(this.empresa(req), req.user.userId);
  }

  // ── Recursos de marca (logo, fotos, videos, documentos) ──

  @Get('recursos')
  @Section('MARKETING', 'view')
  recursos(@Req() req: any) {
    return this.service.listarRecursos(this.empresa(req));
  }

  @Post('recursos')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  @UseFilters(ArchivoGrandeFilter)
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  subirRecurso(@Req() req: any, @UploadedFile() archivo: Express.Multer.File, @Body() dto: RecursoDto) {
    return this.service.subirRecurso(this.empresa(req), archivo, dto);
  }

  @Get('recursos/:id/archivo')
  @Section('MARKETING', 'view')
  async archivoRecurso(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Res() res: any) {
    const archivo = await this.service.archivoDeRecurso(this.empresa(req), id);
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(archivo.buffer);
  }

  @Delete('recursos/:id')
  @Section('MARKETING', 'write')
  eliminarRecurso(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarRecurso(this.empresa(req), id);
  }

  // ── Dashboard, canales, conexiones, calendario, propuestas y radar (antes de las rutas «:id») ──

  @Get('resumen')
  @Section('MARKETING', 'view')
  resumen(@Req() req: any) {
    return this.crecimiento.resumen(this.empresa(req));
  }

  @Post('canales/sugerir')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  sugerirCanales(@Req() req: any, @Body() dto: SugerirCanalesDto) {
    return this.crecimiento.sugerirCanales(this.empresa(req), req.user.userId, dto);
  }

  /** Decide si un canal escrito a mano necesita una integración o no (ferias, radio, volantes…). */
  @Post('canales/clasificar-extra')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  clasificarCanalExtra(@Body() dto: ClasificarCanalExtraDto) {
    return this.service.clasificarCanalExtra(dto.nombre);
  }

  @Get('conexiones')
  @Section('MARKETING', 'view')
  conexiones(@Req() req: any) {
    return this.crecimiento.conexiones(this.empresa(req));
  }

  @Post('conexiones/:canal')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  cambiarConexion(@Req() req: any, @Param('canal') canal: string, @Body() dto: ConexionDto) {
    return this.crecimiento.cambiarConexion(this.empresa(req), req.user.userId, canal, dto.accion, dto.detalle);
  }

  @Get('requerimientos')
  @Section('MARKETING', 'view')
  requerimientos(@Req() req: any) {
    return this.crecimiento.listarRequerimientos(this.empresa(req));
  }

  @Post('requerimientos')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  async crearRequerimiento(@Req() req: any, @Body() dto: RequerimientoDto) {
    const empresa = this.empresa(req);
    await this.service.registrarRequerimiento(empresa, req.user.userId, dto);
    return this.crecimiento.listarRequerimientos(empresa);
  }

  @Get('calendario')
  @Section('MARKETING', 'view')
  calendario(@Req() req: any, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.crecimiento.calendario(this.empresa(req), desde, hasta);
  }

  @Patch('piezas/:id/fecha')
  @Section('MARKETING', 'write')
  moverPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: FechaPiezaDto) {
    return this.crecimiento.moverPieza(this.empresa(req), id, dto.fecha);
  }

  @Get('propuestas')
  @Section('MARKETING', 'view')
  propuestas(@Req() req: any) {
    return this.crecimiento.listarPropuestas(this.empresa(req));
  }

  @Post('propuestas/generar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  generarPropuestas(@Req() req: any) {
    return this.crecimiento.generarPropuestas(this.empresa(req), req.user.userId);
  }

  @Post('propuestas/:id/aceptar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  aceptarPropuesta(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.crecimiento.aceptarPropuesta(this.empresa(req), req.user.userId, id);
  }

  @Post('propuestas/:id/descartar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  descartarPropuesta(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.crecimiento.descartarPropuesta(this.empresa(req), req.user.userId, id);
  }

  @Get('radar')
  @Section('MARKETING', 'view')
  radar(@Req() req: any) {
    return this.crecimiento.radar(this.empresa(req));
  }

  @Post('radar/generar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  generarRadar(@Req() req: any, @Body() dto: RadarDto) {
    return this.crecimiento.generarRadar(this.empresa(req), req.user.userId, dto.competidores);
  }

  @Post('envios/:id/publicar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  publicarEnvio(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: PublicarEnvioDto) {
    return this.crecimiento.publicarEnvio(this.empresa(req), id, dto.programadoPara);
  }

  @Get('piezas/:id')
  @Section('MARKETING', 'view')
  verPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.detalle(this.empresa(req), id);
  }

  @Patch('piezas/:id')
  @Section('MARKETING', 'write')
  editarPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePieceDto) {
    return this.service.actualizarPieza(this.empresa(req), id, dto);
  }

  @Post('piezas/:id/recuperar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  recuperarPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.recuperarPieza(this.empresa(req), id);
  }

  @Post('piezas/:id/descartar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  descartarPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.descartarPieza(this.empresa(req), id);
  }

  @Get('piezas/:id/archivo')
  @Section('MARKETING', 'view')
  async archivoPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Res() res: any) {
    const archivo = await this.service.archivoDePieza(this.empresa(req), id);
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(archivo.buffer);
  }

  @Post('piezas/:id/video')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  generarVideo(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.generarVideo(this.empresa(req), id, req.user.userId);
  }

  @Post('piezas/:id/imagen')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  generarImagen(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: GenerarImagenDto) {
    return this.service.generarImagen(this.empresa(req), id, req.user.userId, dto?.feedback);
  }

  @Get()
  @Section('MARKETING', 'view')
  listar(@Req() req: any) {
    return this.service.listar(this.empresa(req));
  }

  @Post()
  @HttpCode(200)
  @Section('MARKETING', 'write')
  crear(@Req() req: any, @Body() dto: CreateCampaignDto) {
    return this.service.crear(this.empresa(req), req.user.userId, dto);
  }

  @Post('entrevista/siguiente')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  siguientePregunta(@Req() req: any, @Body() dto: SiguientePreguntaDto) {
    return this.service.siguientePregunta(this.empresa(req), req.user.userId, dto);
  }

  @Get('biblioteca')
  @Section('MARKETING', 'view')
  biblioteca(@Req() req: any, @Query('estado') estado?: string) {
    return this.service.listarPiezas(this.empresa(req), estado);
  }

  @Get('envios')
  @Section('MARKETING', 'view')
  listarEnvios(@Req() req: any) {
    return this.service.listarEnvios(this.empresa(req));
  }

  @Post('envios/:id/omitir')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  omitirEnvio(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.omitirEnvio(this.empresa(req), id);
  }

  @Post(':id/publicar-todo')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  publicarTodo(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.crecimiento.publicarTodo(this.empresa(req), id);
  }

  @Get(':id/envios')
  @Section('MARKETING', 'view')
  enviosDeCampana(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listarEnvios(this.empresa(req), id);
  }

  @Post(':id/preparar-envios')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  prepararEnvios(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.prepararEnvios(this.empresa(req), id, req.user.userId);
  }

  @Get(':id')
  @Section('MARKETING', 'view')
  detalle(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.detalleConRefresco(this.empresa(req), id);
  }

  @Delete(':id')
  @Section('MARKETING', 'write')
  eliminar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarCampania(this.empresa(req), id);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  aprobar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.aprobarTodo(this.empresa(req), id, req.user.userId);
  }

  @Post(':id/regenerar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  regenerar(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: RegenerarDto) {
    return this.service.regenerar(this.empresa(req), id, req.user.userId, dto.feedback);
  }

  @Post(':id/desaprobar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  desaprobar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.desaprobar(this.empresa(req), id);
  }
}
