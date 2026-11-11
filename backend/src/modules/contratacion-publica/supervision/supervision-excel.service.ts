import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

/** Lo que el Excel necesita del cronograma (sale de `SupervisionService.obtener`). */
export interface CronogramaParaExcel {
  contratoNumero: string;
  entidadNombre: string;
  administradorNombre: string | null;
  administradorCargo: string | null;
  fechaInicio: string;
  fechaFin: string;
  dias: string[];
  puntos: {
    puestoNombre: string;
    supervisorNombre: string | null;
    jornada: string;
    estados: Record<string, 'CUMPLIDA' | 'PENDIENTE' | 'SIN_VISITA' | 'EXTRA' | null>;
  }[];
}

const SEMANA = ['D', 'L', 'M', 'MI', 'J', 'V', 'S'];
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');
const diaSemana = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
};

/**
 * Cronograma de inspección de puntos de seguridad, con el formato del que ya presentan (punto, supervisor
 * asignado, jornada, una marca por día y las firmas de quien elabora y de quien aprueba), más el cumplimiento:
 * «✓» visita hecha, «x» planeada (en rojo si ya pasó sin visita) y «+» visita en un día no planeado.
 */
@Injectable()
export class SupervisionExcelService {
  async generar(c: CronogramaParaExcel): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cronograma', { pageSetup: { orientation: 'landscape', fitToPage: true } });
    const totalCols = 4 + c.dias.length;
    const borde = { style: 'thin' as const, color: { argb: 'FF999999' } };
    const bordes = { top: borde, left: borde, bottom: borde, right: borde };

    ws.mergeCells(1, 1, 1, totalCols);
    const titulo = ws.getCell(1, 1);
    titulo.value = 'CRONOGRAMA INSPECCIÓN DE PUNTOS DE SEGURIDAD / SUPERVISIÓN';
    titulo.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
    titulo.alignment = { horizontal: 'center' };

    ws.mergeCells(2, 1, 2, totalCols);
    const info = ws.getCell(2, 1);
    info.value = `Contrato / orden de compra: ${c.contratoNumero} | Entidad: ${c.entidadNombre} | Periodo: del ${fechaCorta(c.fechaInicio)} al ${fechaCorta(c.fechaFin)}`;
    info.alignment = { horizontal: 'center' };
    info.font = { size: 10 };

    // Dos filas de encabezado: la letra del día y su número.
    const encabezados = ['ITEM', 'PUNTO DE SERVICIO', 'SUPERVISOR ASIGNADO', 'JORNADA'];
    encabezados.forEach((t, i) => {
      ws.mergeCells(4, i + 1, 5, i + 1);
      const cell = ws.getCell(4, i + 1);
      cell.value = t;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = bordes;
    });
    c.dias.forEach((f, i) => {
      const col = 5 + i;
      const fin = ws.getCell(4, col);
      fin.value = diaSemana(f);
      const dia = ws.getCell(5, col);
      dia.value = Number(f.slice(8, 10));
      for (const cell of [fin, dia]) {
        cell.font = { bold: true, size: 9, color: { argb: ['D', 'S'].includes(diaSemana(f)) ? 'FFC53030' : 'FF1A202C' } };
        cell.alignment = { horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = bordes;
      }
      ws.getColumn(col).width = 3.6;
    });
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 46;
    ws.getColumn(3).width = 24;
    ws.getColumn(4).width = 18;

    c.puntos.forEach((p, idx) => {
      const fila = 6 + idx;
      const valores = [idx + 1, p.puestoNombre, p.supervisorNombre || '—', p.jornada];
      valores.forEach((v, i) => {
        const cell = ws.getCell(fila, i + 1);
        cell.value = v;
        cell.border = bordes;
        cell.alignment = { vertical: 'middle', wrapText: i === 1, horizontal: i === 1 ? 'left' : 'center' };
        cell.font = { size: 10 };
      });
      c.dias.forEach((f, i) => {
        const cell = ws.getCell(fila, 5 + i);
        const estado = p.estados[f];
        cell.border = bordes;
        cell.alignment = { horizontal: 'center' };
        cell.font = { size: 10, bold: estado === 'CUMPLIDA' };
        if (estado === 'CUMPLIDA') {
          cell.value = '✓';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6F6D5' } };
        } else if (estado === 'SIN_VISITA') {
          cell.value = 'x';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7D7' } };
        } else if (estado === 'PENDIENTE') {
          cell.value = 'x';
        } else if (estado === 'EXTRA') {
          cell.value = '+';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBEE3F8' } };
        }
      });
    });

    const finTabla = 6 + c.puntos.length;
    ws.mergeCells(finTabla + 1, 1, finTabla + 1, totalCols);
    const leyenda = ws.getCell(finTabla + 1, 1);
    leyenda.value = '✓ visita hecha  |  x planeada (en rojo: ya pasó sin visita)  |  + visita en un día que no estaba planeado';
    leyenda.font = { size: 9, italic: true, color: { argb: 'FF4A5568' } };

    // Firmas: quien elabora (los supervisores del cronograma) y quien aprueba (el administrador de la orden de compra).
    const supervisores = [...new Set(c.puntos.map((p) => p.supervisorNombre?.trim()).filter((x): x is string => !!x))];
    const filaFirma = finTabla + 4;
    const mitad = Math.max(2, Math.floor(totalCols / 2));
    ws.getCell(filaFirma, 2).value = 'ELABORADO POR:';
    ws.getCell(filaFirma, 2).font = { bold: true };
    ws.getCell(filaFirma + 4, 2).value = supervisores.length ? supervisores.join(' / ').toUpperCase() : 'SUPERVISOR GEMESEG';
    ws.getCell(filaFirma + 5, 2).value = 'SUPERVISOR GEMESEG';
    ws.getCell(filaFirma, mitad + 1).value = 'APROBADO POR:';
    ws.getCell(filaFirma, mitad + 1).font = { bold: true };
    ws.getCell(filaFirma + 4, mitad + 1).value = (c.administradorNombre || '').toUpperCase() || '(administrador del contrato sin registrar)';
    ws.getCell(filaFirma + 5, mitad + 1).value = (c.administradorCargo || 'Administrador de la orden de compra').toUpperCase();

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
