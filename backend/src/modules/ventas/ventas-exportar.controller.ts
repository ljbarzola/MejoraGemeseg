import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasHistorialExportService } from './ventas-historial-export.service';
import {
  exportarTablaExcel,
  exportarTablaPdf,
} from '../../common/utils/tabla-export.util';

export class ExportarTablaDto {
  @IsIn(['pdf', 'xlsx'])
  formato: 'pdf' | 'xlsx';

  @IsString()
  @MaxLength(80)
  titulo: string;

  // Columnas en el orden que eligió la persona.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(60)
  columns: { key: string; label: string }[];

  // Filas ya filtradas y ordenadas en la pantalla, con los valores en texto.
  // No se valida la forma interna: las claves dependen de cada tabla.
  @IsArray()
  @ArrayMaxSize(20000)
  rows: Record<string, unknown>[];
}

export class HistorialExportarDto {
  // Una entrada por fila de la tabla: dice de qué oportunidad, posible cliente o
  // empresa/persona es, para traer su historial. La forma se revisa en el servicio.
  @IsArray()
  @ArrayMaxSize(20000)
  filas: {
    fila: string;
    leadId?: number | null;
    oportunidadId?: number | null;
    clienteId?: number | null;
  }[];
}

// Exportar a PDF o Excel lo que se ve en cualquier tabla de Ventas y CRM. Los
// datos ya los tiene la pantalla (con sus filtros), así que el servidor solo
// les da formato; el CSV se arma en el navegador.
@Controller('ventas/exportar-tabla')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasExportarController {
  constructor(private readonly historial: VentasHistorialExportService) {}

  // Columna «Historial» del exportador: cambios de etapa, notas, llamadas y motivos de cierre de cada fila.
  @Post('historial')
  @Section('VENTAS', 'view')
  historiales(@Req() req: any, @Body() dto: HistorialExportarDto) {
    return this.historial.historiales(
      req.user.companyId,
      dto.filas.map((f) => ({
        fila: String(f.fila),
        leadId: Number(f.leadId) || null,
        oportunidadId: Number(f.oportunidadId) || null,
        clienteId: Number(f.clienteId) || null,
      })),
    );
  }

  @Post()
  @Section('VENTAS', 'view')
  async exportar(@Body() dto: ExportarTablaDto, @Res() res: Response) {
    const esExcel = dto.formato === 'xlsx';
    const archivo = esExcel
      ? await exportarTablaExcel(dto.titulo, dto.columns, dto.rows)
      : await exportarTablaPdf(dto.titulo, dto.columns, dto.rows);
    res.setHeader(
      'Content-Type',
      esExcel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
    );
    res.setHeader('Content-Length', archivo.length.toString());
    res.end(archivo);
  }
}
