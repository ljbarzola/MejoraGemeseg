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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPHorariosService } from './horarios.service';
import { CPHorariosPdfService } from './horarios-pdf.service';
import { CPHorariosExcelService } from './horarios-excel.service';
import { CPHorariosImportarService } from './horarios-importar.service';
import { CPHorariosEjecutadoService } from './horarios-ejecutado.service';
import { CreateHorarioDto } from './dto/create-horario.dto';
import { UpsertCeldaDto } from './dto/upsert-celda.dto';
import { ReemplazarCeldasPuestoDto } from './dto/reemplazar-celdas-puesto.dto';
import { IntercambiarTurnoDto } from './dto/intercambiar-turno.dto';
import { CambiarEstadoHorarioDto } from './dto/cambiar-estado-horario.dto';
import { GenerarPatronDto } from './dto/generar-patron.dto';

@Controller('contratacion-publica/horarios')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPHorariosController {
  constructor(
    private readonly service: CPHorariosService,
    private readonly pdfService: CPHorariosPdfService,
    private readonly excelService: CPHorariosExcelService,
    private readonly importarService: CPHorariosImportarService,
    private readonly ejecutadoService: CPHorariosEjecutadoService,
  ) {}

  @Get()
  @Section('OPERACIONES', 'view')
  findAll(
    @Query('contratoId', new ParseIntPipe({ optional: true })) contratoId: number | undefined,
    @Req() req: any,
  ) {
    // Sin contrato: los horarios de todos los contratos (pantalla «Horarios» del menú).
    return contratoId === undefined
      ? this.service.findAll(req.user.companyId)
      : this.service.findAllByContrato(contratoId, req.user.companyId);
  }

  @Get(':id')
  @Section('OPERACIONES', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @Section('OPERACIONES', 'write')
  create(@Body() dto: CreateHorarioDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Get(':id/relacionados')
  @Section('OPERACIONES', 'view')
  relacionados(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.relacionados(id, req.user.companyId);
  }

  @Delete(':id')
  @Section('OPERACIONES', 'write')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('confirmar') confirmar: string | undefined,
    @Req() req: any,
  ) {
    return this.service.remove(id, req.user.companyId, confirmar === 'true');
  }

  @Post(':id/celdas')
  @Section('OPERACIONES', 'write')
  upsertCelda(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCeldaDto,
    @Req() req: any,
  ) {
    return this.service.upsertCelda(id, dto, req.user.companyId);
  }

  @Post(':id/celdas/reemplazar-puesto')
  @Section('OPERACIONES', 'write')
  reemplazarCeldasPuesto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReemplazarCeldasPuestoDto,
    @Req() req: any,
  ) {
    return this.service.reemplazarCeldasPuesto(id, dto, req.user.companyId);
  }

  @Post(':id/generar-patron')
  @Section('OPERACIONES', 'write')
  generarPatron(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerarPatronDto,
    @Req() req: any,
  ) {
    return this.service.generarPatron(id, dto, req.user.companyId);
  }

  @Post(':id/intercambiar-turno')
  @Section('OPERACIONES', 'write')
  intercambiarTurno(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IntercambiarTurnoDto,
    @Req() req: any,
  ) {
    return this.service.intercambiarTurno(id, dto, req.user.companyId);
  }

  @Patch(':id/estado')
  @Section('OPERACIONES', 'write')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoHorarioDto,
    @Req() req: any,
  ) {
    return this.service.cambiarEstado(id, dto, req.user.companyId);
  }

  @Get(':id/pdf')
  @Section('OPERACIONES', 'view')
  async exportarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.service.getPdfData(id, req.user.companyId);
      const pdfBuffer = await this.pdfService.generarPdfHorario(data);
      const filename = `horario_${data.contratoNumero.replace(/[^a-zA-Z0-9-]/g, '_')}_${data.fechaInicio}_${data.fechaFin}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.end(pdfBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Lee un Excel de horarios. Sin `aplicar=true` solo muestra qué importaría
   * (vista previa); con `aplicar=true` lo guarda. `hoja` elige la hoja del libro.
   */
  @Post(':id/importar-excel')
  @Section('OPERACIONES', 'write')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  importarExcel(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File,
    @Query('hoja') hoja: string | undefined,
    @Query('aplicar') aplicar: string | undefined,
    @Req() req: any,
  ) {
    return this.importarService.importar(id, req.user.companyId, archivo?.buffer, hoja || undefined, aplicar === 'true');
  }

  /** Lo que realmente pasó: programado + faltas/reemplazos + cruce con Custodias. */
  @Get(':id/ejecutado')
  @Section('OPERACIONES', 'view')
  ejecutado(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ejecutadoService.ejecutado(id, req.user.companyId);
  }

  @Get(':id/ejecutado/excel')
  @Section('OPERACIONES', 'view')
  async ejecutadoExcel(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.ejecutadoService.datosParaExcel(id, req.user.companyId);
      const buffer = await this.excelService.generarExcelHorario(data);
      const filename = `ejecutado_${data.contratoNumero.replace(/[^a-zA-Z0-9-]/g, '_')}_${data.fechaInicio}_${data.fechaFin}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.end(buffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  @Get(':id/excel')
  @Section('OPERACIONES', 'view')
  async exportarExcel(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const data = await this.service.getPdfData(id, req.user.companyId);
      const excelBuffer = await this.excelService.generarExcelHorario(data);
      const filename = `horario_${data.contratoNumero.replace(/[^a-zA-Z0-9-]/g, '_')}_${data.fechaInicio}_${data.fechaFin}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.end(excelBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
