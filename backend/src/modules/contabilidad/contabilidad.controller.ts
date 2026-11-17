import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
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
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { ContabilidadService, type AjusteDto, type CrearTarifaDto, type RegistrarPagosDto } from './contabilidad.service';
import { generarExcelNomina } from './nomina-excel.util';
import { NominaPdfService } from './nomina-pdf.service';

/** Contabilidad (2026-11-16): tarifas, nómina y ganancias de las custodias. Sección CONTABILIDAD. */
@Controller('contabilidad')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class ContabilidadController {
  private readonly logger = new Logger(ContabilidadController.name);

  constructor(
    private readonly service: ContabilidadService,
    private readonly pdf: NominaPdfService,
  ) {}

  private empresa(req: any): number {
    if (!req.user.companyId) {
      throw new BadRequestException('Entra con un usuario de una empresa para ver Contabilidad.');
    }
    return req.user.companyId;
  }

  @Get('dashboard')
  @Section('CONTABILIDAD', 'view')
  dashboard(@Req() req: any, @Query('mes') mes?: string) {
    return this.service.getDashboard(this.empresa(req), mes);
  }

  @Get('tarifas')
  @Section('CONTABILIDAD', 'view')
  tarifas(@Req() req: any) {
    return this.service.getTarifas(this.empresa(req));
  }

  @Post('tarifas')
  @Section('CONTABILIDAD', 'write')
  crearTarifa(@Req() req: any, @Body() dto: CrearTarifaDto) {
    return this.service.crearTarifa(this.empresa(req), req.user.userId, dto);
  }

  @Patch('tarifas/:id')
  @Section('CONTABILIDAD', 'write')
  actualizarTarifa(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CrearTarifaDto>,
  ) {
    return this.service.actualizarTarifa(this.empresa(req), id, dto);
  }

  @Delete('tarifas/:id')
  @Section('CONTABILIDAD', 'write')
  eliminarTarifa(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarTarifa(this.empresa(req), id);
  }

  // Extras y descuentos de la liquidación (2026-11-16).
  @Get('ajustes')
  @Section('CONTABILIDAD', 'view')
  ajustes(@Req() req: any) {
    return this.service.getAjustes(this.empresa(req));
  }

  @Post('ajustes')
  @Section('CONTABILIDAD', 'write')
  crearAjuste(@Req() req: any, @Body() dto: AjusteDto) {
    return this.service.crearAjuste(this.empresa(req), req.user.userId, dto);
  }

  @Patch('ajustes/:id')
  @Section('CONTABILIDAD', 'write')
  actualizarAjuste(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: AjusteDto) {
    return this.service.actualizarAjuste(this.empresa(req), id, dto);
  }

  @Delete('ajustes/:id')
  @Section('CONTABILIDAD', 'write')
  eliminarAjuste(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarAjuste(this.empresa(req), id);
  }

  // Listado de pagos (una fila por persona y viaje); la pantalla filtra por columna.
  @Get('pagos')
  @Section('CONTABILIDAD', 'view')
  pagos(@Req() req: any) {
    return this.service.getPagos(this.empresa(req));
  }

  // Registro de pagos: marcar como pagado (con fecha y referencia), corregirlo y deshacerlo.
  @Post('pagos/registrar')
  @Section('CONTABILIDAD', 'write')
  registrarPagos(@Req() req: any, @Body() dto: RegistrarPagosDto) {
    return this.service.registrarPagos(this.empresa(req), req.user.userId, dto);
  }

  @Patch('pagos/registrados/:id')
  @Section('CONTABILIDAD', 'write')
  editarPagoRegistrado(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { fecha?: string; referencia?: string },
  ) {
    return this.service.editarPagoRegistrado(this.empresa(req), id, dto);
  }

  @Post('pagos/deshacer')
  @Section('CONTABILIDAD', 'write')
  deshacerPagos(@Req() req: any, @Body() dto: { ids: number[] }) {
    return this.service.deshacerPagos(this.empresa(req), dto?.ids);
  }

  // La misma nómina del PDF, en Excel (resumen por persona, detalle por viaje y ajustes).
  @Get('nomina/excel')
  @Section('CONTABILIDAD', 'view')
  async nominaExcel(
    @Req() req: any,
    @Res() res: Response,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('cedula') cedula?: string,
  ) {
    try {
      const nomina = await this.service.getNomina(this.empresa(req), fechaInicio, fechaFin);
      if (cedula && !nomina.empleados_detalle?.some((e: any) => e.cedula === cedula)) {
        throw new BadRequestException('Esa persona no tiene pagos en el período elegido.');
      }
      const buffer = await generarExcelNomina(nomina, cedula || undefined);
      const quien = cedula ? `rol_pago_${cedula}` : 'nomina';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${quien}_${fechaInicio}_${fechaFin}.xlsx"`);
      res.end(buffer);
    } catch (err: any) {
      this.logger.error(`No se pudo generar el Excel de nómina: ${err?.message}`);
      const msg = err instanceof BadRequestException ? err.message : 'No se pudo generar el Excel. Inténtalo de nuevo.';
      res.status(400).json({ error: msg, message: msg });
    }
  }

  @Get('nomina/pdf')
  @Section('CONTABILIDAD', 'view')
  async nominaPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('cedula') cedula?: string,
    @Query('todos') todos?: string,
  ) {
    try {
      const nomina = await this.service.getNomina(this.empresa(req), fechaInicio, fechaFin);
      let buffer: Buffer;
      let nombre: string;
      if (cedula) {
        buffer = await this.pdf.generarPdfIndividual(nomina, cedula);
        const emp = nomina.empleados_detalle?.find((e: any) => e.cedula === cedula);
        const slug = (emp?.nombre || 'empleado').replace(/[^\w]+/g, '_');
        nombre = `rol_pago_${slug}_${fechaInicio}_${fechaFin}.pdf`;
      } else if (todos === 'true') {
        buffer = await this.pdf.generarPdfTodosTrabajadores(nomina);
        nombre = `nomina_todos_${fechaInicio}_${fechaFin}.pdf`;
      } else {
        buffer = await this.pdf.generarPdfNomina(nomina);
        nombre = `nomina_gemeseg_${fechaInicio}_${fechaFin}.pdf`;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.end(buffer);
    } catch (err: any) {
      // Los avisos pensados para la persona (BadRequest) se muestran; el resto, no.
      this.logger.error(`No se pudo generar el PDF de nómina: ${err?.message}`);
      const msg =
        err instanceof BadRequestException || err?.message?.startsWith('No hay datos') ||
        err?.message?.startsWith('Empleado no encontrado')
          ? err.message
          : 'No se pudo generar el PDF. Inténtalo de nuevo.';
      res.status(400).json({ error: msg, message: msg });
    }
  }
}
