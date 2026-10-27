import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlPdfNode = require('html-pdf-node');

// Exportación genérica de una tabla ya armada en el navegador (columnas en el
// orden elegido + filas con los valores ya en texto). La usan Guardias (PDF) y
// todas las tablas de Ventas y CRM (PDF y Excel). El CSV se arma en el
// navegador y no pasa por aquí.

export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRow = Record<string, unknown>;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function validar(columns: ExportColumn[]) {
  if (!columns?.length) {
    throw new BadRequestException('Selecciona al menos una columna para exportar');
  }
}

export async function exportarTablaPdf(
  titulo: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): Promise<Buffer> {
  validar(columns);
  const header = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c.key])}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #1a202c; }
      h1 { font-size: 14pt; margin: 0 0 4px; }
      p.meta { font-size: 9pt; color: #666; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 9pt; word-break: break-word; white-space: pre-line; }
      th { background: #f0f0f0; }
    </style></head><body>
      <h1>${escapeHtml(titulo)}</h1>
      <p class="meta">Generado el ${new Date().toLocaleDateString('es-EC')} — ${rows.length} registro(s)</p>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`;

  return htmlPdfNode.generatePdf(
    { content: html },
    {
      format: 'A4',
      landscape: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
      printBackground: true,
    },
  );
}

export async function exportarTablaExcel(
  titulo: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): Promise<Buffer> {
  validar(columns);
  const libro = new ExcelJS.Workbook();
  // Excel limita el nombre de la hoja a 31 caracteres y prohíbe ciertos signos.
  const hoja = libro.addWorksheet(titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Datos');

  hoja.addRow(columns.map((c) => c.label));
  const cabecera = hoja.getRow(1);
  cabecera.font = { bold: true };
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    // Los números (montos) quedan como número para poder sumarlos; el resto va
    // como texto, así una cédula o un teléfono no pierden el cero inicial.
    hoja.addRow(columns.map((c) => (typeof r[c.key] === 'number' ? r[c.key] : String(r[c.key] ?? ''))));
  }
  // Los textos con varias líneas (el historial) se ven completos dentro de la celda.
  hoja.eachRow((fila, n) => {
    if (n > 1) fila.alignment = { vertical: 'top', wrapText: true };
  });

  columns.forEach((c, i) => {
    const mayor = rows.reduce(
      (max, r) => Math.max(max, ...String(r[c.key] ?? '').split(/\r?\n/).map((l) => l.length)),
      c.label.length,
    );
    hoja.getColumn(i + 1).width = Math.min(Math.max(mayor + 2, 10), 60);
  });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
