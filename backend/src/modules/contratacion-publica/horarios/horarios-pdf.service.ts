import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatFechaCorta } from '../shared/fecha-rango.util';

const NAVY = '#1e3a5f';
const GOLD = '#d4a017';
const HEADER_BG = '#1e3a5f';
const ROW_ALT_BG = '#f8fafc';

export interface HorarioPdfPuesto {
  nombre: string;
  tipoTurno: string;
  filas: Array<{
    cedula: string;
    nombreGuardia: string;
    porFecha: Record<string, string>; // 'YYYY-MM-DD' -> código de turno
  }>;
}

export interface HorarioPdfData {
  contratoNumero: string;
  entidadNombre: string;
  fechaInicio: string; // 'YYYY-MM-DD'
  fechaFin: string; // 'YYYY-MM-DD'
  rangoLabel: string; // "30 DE JULIO DE 2026 AL 29 DE AGOSTO DE 2026"
  anio: number;
  mes: number;
  estado: string;
  fechas: string[]; // lista ordenada de 'YYYY-MM-DD' del rango completo
  puestos: HorarioPdfPuesto[];
  colorPorCodigo: Record<string, string | null>;
}

@Injectable()
export class CPHorariosPdfService {
  /**
   * Tabla apaisada agrupada por puesto de servicio, con una columna por
   * fecha real del rango (no día de mes calendario) y el código de turno en
   * cada celda — mismo patrón de PDFKit que `custodias/pdf.service.ts`.
   */
  async generarPdfHorario(data: HorarioPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({
        margin: 25,
        size: 'A4',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fechas = data.fechas;
      const startX = 25;
      const pageWidth = doc.page.width - 50;

      doc
        .fillColor(NAVY)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('GEMESEG', { align: 'center' });
      doc
        .fillColor('#4a5568')
        .fontSize(10)
        .font('Helvetica')
        .text('Horario Mensual de Guardias — Contratación Pública', {
          align: 'center',
        });
      doc.moveDown(0.2);
      doc
        .strokeColor(GOLD)
        .lineWidth(1.5)
        .moveTo(startX, doc.y)
        .lineTo(startX + pageWidth, doc.y)
        .stroke();
      doc.moveDown(0.4);

      doc.fillColor('#2d3748').fontSize(8).font('Helvetica');
      doc.text(
        `Contrato: ${data.contratoNumero}  |  Entidad: ${data.entidadNombre}`,
      );
      doc.text(`Período: ${data.rangoLabel}  |  Estado: ${data.estado}`);
      doc.moveDown(0.5);

      const nombreW = 110;
      const cedulaW = 60;
      const restante = pageWidth - nombreW - cedulaW;
      const diaW = restante / Math.max(fechas.length, 1);

      for (const puesto of data.puestos) {
        if (doc.y > doc.page.height - 100) doc.addPage();

        doc
          .fillColor(NAVY)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(`${puesto.nombre} (${puesto.tipoTurno})`, startX, doc.y);
        doc.moveDown(0.2);

        let y = doc.y;
        const headerH = 16;
        doc.rect(startX, y, pageWidth, headerH).fill(HEADER_BG);
        doc.fillColor('#ffffff').fontSize(5.5).font('Helvetica-Bold');
        let x = startX + 2;
        doc.text('GUARDIA', x, y + 4, { width: nombreW - 4 });
        x += nombreW;
        doc.text('CÉDULA', x, y + 4, { width: cedulaW - 4 });
        x += cedulaW;
        for (const fecha of fechas) {
          doc.text(formatFechaCorta(fecha), x, y + 4, {
            width: diaW,
            align: 'center',
          });
          x += diaW;
        }
        y += headerH;

        const rowH = 14;
        puesto.filas.forEach((fila, idx) => {
          if (y > doc.page.height - 40) {
            doc.addPage();
            y = 30;
          }
          if (idx % 2 === 1) {
            doc.rect(startX, y, pageWidth, rowH).fill(ROW_ALT_BG);
          }
          let cx = startX + 2;
          doc
            .fillColor('#1a202c')
            .fontSize(6)
            .font('Helvetica')
            .text(fila.nombreGuardia, cx, y + 3, {
              width: nombreW - 4,
              lineBreak: false,
            });
          cx += nombreW;
          doc.text(fila.cedula, cx, y + 3, { width: cedulaW - 4 });
          cx += cedulaW;
          for (const fecha of fechas) {
            const codigo = fila.porFecha[fecha] || '';
            doc
              .font('Helvetica-Bold')
              .text(codigo, cx, y + 3, { width: diaW, align: 'center' });
            cx += diaW;
          }
          y += rowH;
        });

        doc.y = y + 10;
      }

      doc.end();
    });
  }
}
