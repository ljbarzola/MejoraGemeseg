import { Injectable } from '@nestjs/common';
import {
  exportarTablaPdf,
  type ExportColumn,
} from '../../../common/utils/tabla-export.util';

export type { ExportColumn };

// Genera el PDF del listado de guardias con exactamente las columnas y filas
// que el usuario configuró/filtró en la vista (recibidas ya armadas desde el
// frontend, ver GuardiasExportModal). El armado del PDF es el mismo de las
// tablas de Ventas: common/utils/tabla-export.util.ts.
@Injectable()
export class GuardiasExportService {
  exportPdf(columns: ExportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    return exportarTablaPdf('Listado de Guardias', columns, rows);
  }
}
