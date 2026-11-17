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
import { PdfService } from './pdf.service';
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

  @Get(':id')
  @Section('CUSTODIAS', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.custodiasService.findOne(id, req.user.companyId);
  }

  @Get(':id/pdf')
  @Section('CUSTODIAS', 'view')
  async exportarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const custodia = await this.custodiasService.findOne(
        id,
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

  @Patch(':id')
  @Section('CUSTODIAS', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustodiaDto,
    @Req() req: any,
  ) {
    return this.custodiasService.update(id, dto, req.user.companyId);
  }

  @Patch(':id/estado')
  @Section('CUSTODIAS', 'write')
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
  @Section('CUSTODIAS', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.custodiasService.remove(id, req.user.companyId);
  }
}
