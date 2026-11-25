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
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Section } from '../../common/decorators/section.decorator';
import { CustodiasConfigService } from './custodias-config.service';
import { CustodiasDispositivosService } from './custodias-dispositivos.service';
import { CustodiasCampoOficinaService } from './custodias-campo-oficina.service';
import { CustodiasNumeracionService } from './custodias-numeracion.service';
import {
  CrearCodigoDispositivoDto,
  CrearPinDto,
  LimpiarFotosDto,
  NumeracionDto,
  RenombrarDispositivoDto,
} from './dto/custodias-campo.dto';

/**
 * Celulares, PIN, y lo que pasó en campo (recorrido, fotos, firmas, espacio), visto desde la oficina (2026-11-24,
 * Fase 2). Va declarado ANTES que CustodiasController en el módulo para que estas rutas fijas no las capture
 * `GET /custodias/:id`. Los permisos son los de la sección OPERACIONES.
 */
@Controller('custodias')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CustodiasOficinaCampoController {
  constructor(
    private readonly config: CustodiasConfigService,
    private readonly dispositivos: CustodiasDispositivosService,
    private readonly oficina: CustodiasCampoOficinaService,
    private readonly numeracion: CustodiasNumeracionService,
  ) {}

  private empresa(req: any): number {
    return this.config.exigirEmpresa(req.user.companyId);
  }

  // ───── Celulares ─────

  @Post('dispositivos/codigo')
  @Section('OPERACIONES', 'write')
  crearCodigo(@Body() dto: CrearCodigoDispositivoDto, @Req() req: any) {
    return this.dispositivos.crearCodigo(this.empresa(req), req.user.userId, dto.nombre);
  }

  @Get('dispositivos')
  @Section('OPERACIONES', 'view')
  listarDispositivos(@Req() req: any) {
    return this.dispositivos.listar(this.empresa(req));
  }

  @Post('dispositivos/:id/desvincular')
  @Section('OPERACIONES', 'write')
  desvincular(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.dispositivos.desvincular(this.empresa(req), id);
  }

  @Post('dispositivos/:id/vincular-de-nuevo')
  @Section('OPERACIONES', 'write')
  vincularDeNuevo(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.dispositivos.crearCodigoVincularDeNuevo(this.empresa(req), req.user.userId, id);
  }

  @Post('dispositivos/:id/quitar')
  @Section('OPERACIONES', 'write')
  quitarDeLaLista(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.dispositivos.quitarDeLaLista(this.empresa(req), id);
  }

  @Patch('dispositivos/:id')
  @Section('OPERACIONES', 'write')
  renombrarDispositivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenombrarDispositivoDto,
    @Req() req: any,
  ) {
    return this.dispositivos.renombrar(this.empresa(req), id, dto.nombre);
  }

  // ───── Numeración de las guías ─────

  @Get('numeracion')
  @Section('OPERACIONES', 'view')
  verNumeracion(@Req() req: any) {
    return this.numeracion.obtener(this.empresa(req));
  }

  @Put('numeracion')
  @Section('OPERACIONES', 'write')
  guardarNumeracion(@Body() dto: NumeracionDto, @Req() req: any) {
    return this.numeracion.guardarPrefijo(this.empresa(req), dto.prefijo);
  }

  // ───── PIN de los custodios ─────

  @Get('pines')
  @Section('OPERACIONES', 'view')
  listarPines(@Req() req: any) {
    return this.dispositivos.listarPines(this.empresa(req));
  }

  @Post('pines')
  @Section('OPERACIONES', 'write')
  crearPin(@Body() dto: CrearPinDto, @Req() req: any) {
    return this.dispositivos.crearPin(this.empresa(req), req.user.userId, dto.cedula, dto.nombre);
  }

  @Delete('pines/:cedula')
  @Section('OPERACIONES', 'write')
  quitarPin(@Param('cedula') cedula: string, @Req() req: any) {
    return this.dispositivos.quitarPin(this.empresa(req), cedula);
  }

  // ───── Espacio de las fotos ─────

  @Get('espacio')
  @Section('OPERACIONES', 'view')
  espacio(@Req() req: any) {
    return this.oficina.espacio(this.empresa(req));
  }

  // Solo el administrador de la empresa borra fotos.
  @Post('espacio/limpiar')
  @Section('OPERACIONES', 'write')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  limpiar(@Body() dto: LimpiarFotosDto, @Req() req: any) {
    return this.oficina.limpiar(this.empresa(req), req.user, dto.antesDe);
  }

  // ───── Fotos y firmas ─────

  @Get('fotos/:fotoId')
  @Section('OPERACIONES', 'view')
  async foto(
    @Param('fotoId', ParseIntPipe) fotoId: number,
    @Query('miniatura') miniatura: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.oficina.foto(
      fotoId,
      this.empresa(req),
      miniatura === '1' || miniatura === 'true',
    );
    this.enviarImagen(res, buffer, contentType);
  }

  @Get('firmas/:firmaId/imagen')
  @Section('OPERACIONES', 'view')
  async firma(@Param('firmaId', ParseIntPipe) firmaId: number, @Req() req: any, @Res() res: Response) {
    const { buffer, contentType } = await this.oficina.firma(firmaId, this.empresa(req));
    this.enviarImagen(res, buffer, contentType);
  }

  private enviarImagen(res: Response, buffer: Buffer, contentType: string) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buffer);
  }

  // ───── Recorrido de un viaje ─────

  @Get(':id/campo')
  @Section('OPERACIONES', 'view')
  campo(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.oficina.campo(id, this.empresa(req));
  }
}
