/**
 * Descarga una tabla como archivo de Excel (.xlsx). Se arma en el navegador con exceljs, que se
 * carga solo al exportar (no pesa en el resto de la app), y exporta lo que la persona ve: las
 * columnas que eligió, en el orden y con el filtro que aplicó.
 */
export type TipoColumnaExcel = 'texto' | 'numero' | 'moneda' | 'fecha' | 'porcentaje';
export type CeldaExcel = string | number | Date | null | undefined;

export interface ColumnaExcel {
  titulo: string;
  tipo: TipoColumnaExcel;
}

const FORMATOS: Record<TipoColumnaExcel, string | undefined> = {
  texto: undefined,
  numero: '#,##0.00##',
  moneda: '"$"#,##0.00',
  fecha: 'dd/mm/yyyy',
  porcentaje: '0.00"%"',
};

/** `2026-10-27` para el nombre del archivo (día local, no UTC). */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nombre seguro para un archivo: sin tildes ni caracteres raros. */
function nombreSeguro(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'cacao';
}

export async function exportarExcel({
  nombre,
  hoja,
  columnas,
  filas,
}: {
  /** Nombre base del archivo, ej. `liquidaciones` → `cacao-liquidaciones-2026-10-27.xlsx`. */
  nombre: string;
  hoja?: string;
  columnas: ColumnaExcel[];
  filas: CeldaExcel[][];
}): Promise<void> {
  // exceljs es pesado: se descarga recién cuando alguien exporta.
  const modulo = await import('exceljs');
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Gemeseg';
  libro.created = new Date();
  const hojaExcel = libro.addWorksheet((hoja || nombre).slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  hojaExcel.columns = columnas.map((c) => ({
    header: c.titulo,
    // Ancho según lo más largo que haya en la columna (con tope).
    width: Math.min(
      48,
      Math.max(
        c.titulo.length + 4,
        ...filas.slice(0, 200).map((f) => {
          const i = columnas.indexOf(c);
          const v = f[i];
          return v instanceof Date ? 12 : String(v ?? '').length + 2;
        }),
      ),
    ),
    style: FORMATOS[c.tipo] ? { numFmt: FORMATOS[c.tipo] } : {},
  }));

  const encabezado = hojaExcel.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  encabezado.alignment = { vertical: 'middle' };

  for (const fila of filas) {
    hojaExcel.addRow(fila.map((v) => (v === undefined ? null : v)));
  }
  if (columnas.length > 0 && filas.length > 0) {
    hojaExcel.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  }

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `cacao-${nombreSeguro(nombre)}-${hoyLocal()}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
