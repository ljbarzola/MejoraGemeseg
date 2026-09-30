import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { HorarioPdfData } from './horarios-pdf.service';
import { formatFechaCorta } from '../shared/fecha-rango.util';

const HEADER_FILL = 'FF1E3A5F';

/** Convierte '#RRGGBB' a 'FFRRGGBB' (formato ARGB que espera ExcelJS). */
function toArgb(color: string | null | undefined): string | null {
  if (!color) return null;
  const hex = color.replace('#', '').toUpperCase();
  if (hex.length !== 6) return null;
  return `FF${hex}`;
}

@Injectable()
export class CPHorariosExcelService {
  /**
   * Misma agrupación por puesto/guardia/fecha que el PDF, reutilizando los
   * mismos datos de `CPHorariosService.getPdfData` — coloreando cada celda
   * igual que en la UI, replicando el look de las hojas de cálculo reales.
   */
  async generarExcelHorario(data: HorarioPdfData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Horario', {
      pageSetup: { orientation: 'landscape', fitToPage: true },
    });

    const fechas = data.fechas;
    const totalCols = 2 + fechas.length;

    sheet.mergeCells(1, 1, 1, totalCols);
    const titulo = sheet.getCell(1, 1);
    titulo.value =
      'GEMESEG — Horario Mensual de Guardias (Contratación Pública)';
    titulo.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
    titulo.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const info = sheet.getCell(2, 1);
    info.value = `Contrato: ${data.contratoNumero} | Entidad: ${data.entidadNombre} | Período: ${data.rangoLabel} | Estado: ${data.estado}`;
    info.alignment = { horizontal: 'center' };
    info.font = { size: 10 };

    let row = 4;

    for (const puesto of data.puestos) {
      sheet.mergeCells(row, 1, row, totalCols);
      const puestoCell = sheet.getCell(row, 1);
      puestoCell.value = `${puesto.nombre} (${puesto.tipoTurno})`;
      puestoCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      puestoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      };
      row++;

      const headerRow = sheet.getRow(row);
      headerRow.getCell(1).value = 'GUARDIA';
      headerRow.getCell(2).value = 'CÉDULA';
      fechas.forEach((fecha, i) => {
        headerRow.getCell(3 + i).value = formatFechaCorta(fecha);
      });
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEDF2F7' },
        };
      });
      row++;

      for (const fila of puesto.filas) {
        const r = sheet.getRow(row);
        r.getCell(1).value = fila.nombreGuardia;
        r.getCell(2).value = fila.cedula;
        fechas.forEach((fecha, i) => {
          const codigo = fila.porFecha[fecha] || '';
          const cell = r.getCell(3 + i);
          cell.value = codigo;
          cell.alignment = { horizontal: 'center' };
          cell.font = { bold: true };
          const argb = toArgb(data.colorPorCodigo[codigo]);
          if (argb) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb },
            };
          }
        });
        row++;
      }
      row++; // fila en blanco entre puestos
    }

    sheet.getColumn(1).width = 26;
    sheet.getColumn(2).width = 14;
    for (let i = 0; i < fechas.length; i++) {
      sheet.getColumn(3 + i).width = 6;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
