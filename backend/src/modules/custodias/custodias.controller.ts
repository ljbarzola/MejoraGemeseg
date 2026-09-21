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
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { CustodiasService } from './custodias.service';
import { PdfService } from './pdf.service';
import { CreateCustodiaDto } from './dto/create-custodia.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('custodias')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CustodiasController {
  constructor(
    private readonly custodiasService: CustodiasService,
    private readonly pdfService: PdfService,
  ) {}

  @Post()
  @Section('CUSTODIAS', 'write')
  create(@Body() dto: CreateCustodiaDto, @Req() req: any) {
    return this.custodiasService.create(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Get()
  @Section('CUSTODIAS', 'view')
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
  @Section('CUSTODIAS', 'view')
  getAvailableCustodios(@Req() req: any) {
    return this.custodiasService.getAvailableCustodios(req.user.companyId);
  }

  @Get('dashboard')
  @Section('CUSTODIAS', 'view')
  getDashboard(@Req() req: any, @Query('mes') mes?: string) {
    return this.custodiasService.getDashboardStats(req.user.companyId, mes);
  }

  @Get('trabajador')
  @Section('CUSTODIAS', 'view')
  getTrabajador(
    @Req() req: any,
    @Query('cedula') cedula: string,
    @Query('mes') mes?: string,
  ) {
    return this.custodiasService.getTrabajadorByCedula(
      req.user.companyId,
      cedula,
      mes,
    );
  }

  @Post('gemebot/query')
  @Section('CUSTODIAS', 'write')
  queryGemeBot(@Req() req: any, @Body('mensaje') mensaje: string) {
    return this.custodiasService.queryGemeBot(req.user.companyId, mensaje);
  }

  @Get('nomina')
  @Section('CUSTODIAS', 'view')
  getNomina(
    @Req() req: any,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
  ) {
    return this.custodiasService.getNomina(
      req.user.companyId,
      fechaInicio,
      fechaFin,
    );
  }

  @Get('nomina/pdf')
  @Section('CUSTODIAS', 'view')
  async exportarNominaPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('cedula') cedula?: string,
    @Query('todos') todos?: string,
  ) {
    try {
      const nomina = await this.custodiasService.getNomina(
        req.user.companyId,
        fechaInicio,
        fechaFin,
      );

      let pdfBuffer: Buffer;
      let filename: string;

      if (cedula) {
        pdfBuffer = await this.pdfService.generarPdfIndividual(nomina, cedula);
        const emp = nomina.empleados_detalle?.find(
          (e: any) => e.cedula === cedula,
        );
        const slug = (emp?.nombre || 'empleado').replace(/\s+/g, '_');
        filename = `rol_pago_${slug}_${fechaInicio}_${fechaFin}.pdf`;
      } else if (todos === 'true') {
        pdfBuffer = await this.pdfService.generarPdfTodosTrabajadores(nomina);
        filename = `nomina_todos_${fechaInicio}_${fechaFin}.pdf`;
      } else {
        pdfBuffer = await this.pdfService.generarPdfNomina(nomina);
        filename = `nomina_gemeseg_${fechaInicio}_${fechaFin}.pdf`;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.end(pdfBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  @Get(':id')
  @Section('CUSTODIAS', 'view')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.custodiasService.findOne(+id, req.user.companyId);
  }

  @Get(':id/pdf')
  @Section('CUSTODIAS', 'view')
  async exportarPdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const custodia = await this.custodiasService.findOne(
        +id,
        req.user.companyId,
      );
      const pdfBuffer = await this.pdfService.generarPdfOrdenCustodia(custodia);
      const filename = `orden_custodia_${custodia.numeroGuia.replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.end(pdfBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  @Patch(':id/estado')
  @Section('CUSTODIAS', 'write')
  updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoDto,
    @Req() req: any,
  ) {
    return this.custodiasService.updateEstado(
      +id,
      dto.estado,
      req.user.companyId,
    );
  }

  @Delete(':id')
  @Section('CUSTODIAS', 'write')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.custodiasService.remove(+id, req.user.companyId);
  }
}
