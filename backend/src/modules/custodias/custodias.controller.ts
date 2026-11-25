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
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { CustodiasService } from './custodias.service';
import { CustodiasPersonalService } from './custodias-personal.service';
import { CreatePersonaCustodiaDto } from './dto/create-persona.dto';
import { CustodiasEnvioService } from './custodias-envio.service';
import { EnviarGuiaDto } from './dto/custodias-config.dto';
import { CreateCustodiaDto } from './dto/create-custodia.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { UpdateCustodiaDto } from './dto/update-custodia.dto';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('custodias')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CustodiasController {
  constructor(
    private readonly custodiasService: CustodiasService,
    private readonly personalService: CustodiasPersonalService,
    private readonly envioService: CustodiasEnvioService,
  ) {}

  // Persona nueva desde el formulario del viaje («No existe, créalo aquí»): entra a la lista de Guardias de RRHH.
  @Post('personal')
  @Section('OPERACIONES', 'write')
  crearPersona(@Body() dto: CreatePersonaCustodiaDto, @Req() req: any) {
    return this.personalService.crear(req.user.companyId, req.user.userId, dto);
  }

  @Post()
  @Section('OPERACIONES', 'write')
  create(@Body() dto: CreateCustodiaDto, @Req() req: any) {
    return this.custodiasService.create(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Get()
  @Section('OPERACIONES', 'view')
  findAll(
    @Req() req: any,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('tipo') tipo?: string,
    @Query('estado') estado?: string,
  ) {
    return this.custodiasService.findAll(req.user.companyId, {
      fechaInicio,
      fechaFin,
      tipo,
      estado,
    });
  }

  @Get('available-custodios')
  @Section('OPERACIONES', 'view')
  getAvailableCustodios(@Req() req: any) {
    return this.custodiasService.getAvailableCustodios(req.user.companyId);
  }

  @Get('dashboard')
  @Section('OPERACIONES', 'view')
  getDashboard(@Req() req: any, @Query('mes') mes?: string) {
    return this.custodiasService.getDashboardStats(req.user.companyId, mes);
  }

  @Get(':id')
  @Section('OPERACIONES', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    // Con la ruta, el cliente del Directorio y cuándo firma el cliente (2026-11-24).
    return this.custodiasService.detalle(id, req.user.companyId);
  }

  // Envío de la guía (PDF) al cliente por correo, con su historial.
  @Get(':id/envio')
  @Section('OPERACIONES', 'view')
  sugerenciaEnvio(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.envioService.sugerencia(id, req.user.companyId);
  }

  @Get(':id/envios')
  @Section('OPERACIONES', 'view')
  historialEnvios(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.envioService.historial(id, req.user.companyId);
  }

  @Post(':id/enviar')
  @Section('OPERACIONES', 'write')
  enviar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarGuiaDto,
    @Req() req: any,
  ) {
    return this.envioService.enviar(id, req.user.companyId, req.user, dto);
  }

  @Get(':id/pdf')
  @Section('OPERACIONES', 'view')
  async exportarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const { viaje: custodia, buffer: pdfBuffer } =
        await this.envioService.pdfDeViaje(id, req.user.companyId);
      const filename = `orden_custodia_${custodia.numeroGuia.replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.end(pdfBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  @Patch(':id')
  @Section('OPERACIONES', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustodiaDto,
    @Req() req: any,
  ) {
    return this.custodiasService.update(id, dto, req.user.companyId);
  }

  @Patch(':id/estado')
  @Section('OPERACIONES', 'write')
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoDto,
    @Req() req: any,
  ) {
    return this.custodiasService.updateEstado(
      id,
      dto.estado,
      req.user.companyId,
      dto.fecha,
    );
  }

  @Delete(':id')
  @Section('OPERACIONES', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.custodiasService.remove(id, req.user.companyId);
  }
}
