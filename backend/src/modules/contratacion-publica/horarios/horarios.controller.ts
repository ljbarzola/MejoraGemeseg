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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPHorariosService } from './horarios.service';
import { CPHorariosPdfService } from './horarios-pdf.service';
import { CPHorariosExcelService } from './horarios-excel.service';
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
  ) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAllByContrato(
    @Query('contratoId', ParseIntPipe) contratoId: number,
    @Req() req: any,
  ) {
    return this.service.findAllByContrato(contratoId, req.user.companyId);
  }

  @Get(':id')
  @Section('CONTRATACION_PUBLICA', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreateHorarioDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Delete(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }

  @Post(':id/celdas')
  @Section('CONTRATACION_PUBLICA', 'write')
  upsertCelda(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCeldaDto,
    @Req() req: any,
  ) {
    return this.service.upsertCelda(id, dto, req.user.companyId);
  }

  @Post(':id/celdas/reemplazar-puesto')
  @Section('CONTRATACION_PUBLICA', 'write')
  reemplazarCeldasPuesto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReemplazarCeldasPuestoDto,
    @Req() req: any,
  ) {
    return this.service.reemplazarCeldasPuesto(id, dto, req.user.companyId);
  }

  @Post(':id/generar-patron')
  @Section('CONTRATACION_PUBLICA', 'write')
  generarPatron(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerarPatronDto,
    @Req() req: any,
  ) {
    return this.service.generarPatron(id, dto, req.user.companyId);
  }

  @Post(':id/intercambiar-turno')
  @Section('CONTRATACION_PUBLICA', 'write')
  intercambiarTurno(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IntercambiarTurnoDto,
    @Req() req: any,
  ) {
    return this.service.intercambiarTurno(id, dto, req.user.companyId);
  }

  @Patch(':id/estado')
  @Section('CONTRATACION_PUBLICA', 'write')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoHorarioDto,
    @Req() req: any,
  ) {
    return this.service.cambiarEstado(id, dto, req.user.companyId);
  }

  @Get(':id/pdf')
  @Section('CONTRATACION_PUBLICA', 'view')
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

  @Get(':id/excel')
  @Section('CONTRATACION_PUBLICA', 'view')
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
