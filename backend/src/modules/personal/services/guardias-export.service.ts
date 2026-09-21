import { Injectable, BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlPdfNode = require('html-pdf-node');

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

export interface ExportColumn {
  key: string;
  label: string;
}

// Genera el PDF del listado de guardias con exactamente las columnas y filas
// que el usuario configuró/filtró en la vista (recibidas ya armadas desde el
// frontend, ver GuardiasExportModal) — mismo patrón HTML-a-PDF que
// VentasContratosService (buildAnnexATable + html-pdf-node), preferido sobre
// PDFKit manual porque las columnas son dinámicas.
@Injectable()
export class GuardiasExportService {
  async exportPdf(
    columns: ExportColumn[],
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    if (!columns?.length) {
      throw new BadRequestException('Selecciona al menos una columna para exportar');
    }

    const header = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = rows
      .map(
        (r) =>
          `<tr>${columns.map((c) => `<td>${escapeHtml(r[c.key])}</td>`).join('')}</tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #1a202c; }
      h1 { font-size: 14pt; margin: 0 0 4px; }
      p.meta { font-size: 9pt; color: #666; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 9pt; word-break: break-word; }
      th { background: #f0f0f0; }
    </style></head><body>
      <h1>Listado de Guardias</h1>
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
}
