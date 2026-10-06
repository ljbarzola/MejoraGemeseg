import ExcelJS from 'exceljs';
import {
  MAX_COLUMNAS_VISTA,
  MAX_FILAS_VISTA,
  colorCss,
  formatearFecha,
  formatearNumero,
  leerLibroExcel,
} from './excel-hojas.util';

describe('excel-hojas.util', () => {
  describe('formatearNumero', () => {
    it.each([
      [1234.5, '"$"#,##0.00', '$1.234,50'],
      [1234.5, '#,##0', '1.235'],
      [0.256, '0.0%', '25,6%'],
      [0.5, '0%', '50%'],
      [7, '000', '007'],
      [1234, 'General', '1234'],
      [0.1 + 0.2, 'General', '0,3'],
      [-5, '#,##0;(#,##0)', '(5)'],
      [-5, '#,##0', '-5'],
      [0, '#,##0;(#,##0);"-"', '-'],
      [12.3456, '0.00', '12,35'],
      [1500, '[$€-407] #,##0.00', '€ 1.500,00'],
    ])('%p con %p → %p', (n, formato, esperado) => {
      expect(formatearNumero(n, formato)).toBe(esperado);
    });

    it('un formato raro (fracciones) cae a "General" en vez de inventar', () => {
      expect(formatearNumero(3, '# ?/?')).toBe('3');
    });
  });

  describe('formatearFecha', () => {
    const d = new Date(Date.UTC(2026, 9, 5, 14, 7, 9));
    it.each([
      ['dd/mm/yyyy', '05/10/2026'],
      ['d-mmm-yy', '5-oct-26'],
      ['mmmm d, yyyy', 'octubre 5, 2026'],
      ['hh:mm:ss', '14:07:09'],
      ['hh:mm AM/PM', '02:07 PM'],
      ['dddd', 'lunes'],
      ['yyyy-mm-dd hh:mm', '2026-10-05 14:07'],
    ])('%p → %p ("m" es minuto junto a las horas, y mes en el resto)', (formato, esperado) => {
      expect(formatearFecha(d, formato)).toBe(esperado);
    });
  });

  describe('colorCss', () => {
    it('resuelve ARGB, tema con tinte e ignora lo transparente', () => {
      expect(colorCss({ argb: 'FF1F3A5F' })).toBe('#1F3A5F');
      expect(colorCss({ argb: '00FFFFFF' })).toBeUndefined();
      expect(colorCss({ theme: 4, tint: 0.6 })).toBe('#B4C7E7');
      expect(colorCss(undefined)).toBeUndefined();
    });
  });

  describe('leerLibroExcel', () => {
    const aBuffer = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());

    it('lee valores, estilos, combinadas, congelados y deja fuera las hojas ocultas', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Prueba', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
      ws.columns = [{ width: 30 }, { width: 14 }];
      ws.mergeCells('A1:B1');
      ws.getCell('A1').value = 'REPORTE';
      ws.getCell('A1').font = { bold: true };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
      ws.getRow(1).height = 30;
      ws.addRow(['Concepto', 'Monto']);
      const fila = ws.addRow(['Sueldos', 1234.5]);
      fila.getCell(2).numFmt = '"$"#,##0.00';
      ws.addRow(['Total', { formula: 'B3*2', result: 2469 }]);
      wb.addWorksheet('Oculta').state = 'hidden';

      const libro = await leerLibroExcel(await aBuffer(wb));

      expect(libro.hojas.map((h) => h.nombre)).toEqual(['Prueba']);
      const h = libro.hojas[0];
      expect(h.congeladas).toEqual({ filas: 2, columnas: 1 });
      expect(h.combinadas).toEqual([[0, 0, 0, 1]]);
      expect(h.anchos).toEqual([215, 103]);
      expect(h.altos[0]).toBe(40);
      const texto = (f: number, c: number) => h.celdas.find((x) => x[0] === f && x[1] === c);
      expect(texto(0, 0)?.[2]).toBe('REPORTE');
      expect(libro.estilos[texto(0, 0)![3]]).toEqual(expect.objectContaining({ b: 1, f: '#1F3A5F' }));
      // La celda cubierta por la combinada no se envía.
      expect(texto(0, 1)).toBeUndefined();
      // Número con formato de moneda, alineado a la derecha; fórmula = su resultado.
      expect(texto(2, 1)?.[2]).toBe('$1.234,50');
      expect(libro.estilos[texto(2, 1)![3]].h).toBe('right');
      expect(texto(3, 1)?.[2]).toBe('2469');
      expect(libro.truncado).toBe(false);
    });

    it('recorta las hojas enormes y lo avisa', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Grande');
      for (let r = 1; r <= MAX_FILAS_VISTA + 10; r++) {
        ws.addRow(Array.from({ length: MAX_COLUMNAS_VISTA + 5 }, (_, k) => r * 100 + k));
      }
      const libro = await leerLibroExcel(await aBuffer(wb));
      const h = libro.hojas[0];
      expect(h.filas).toBe(MAX_FILAS_VISTA);
      expect(h.columnas).toBe(MAX_COLUMNAS_VISTA);
      expect(h.filasTotales).toBe(MAX_FILAS_VISTA + 10);
      expect(libro.truncado).toBe(true);
    });

    it('lanza si no es un .xlsx válido, para que quien llama use el PDF', async () => {
      await expect(leerLibroExcel(Buffer.from('esto no es un xlsx'))).rejects.toBeDefined();
    });

    it('lanza si el libro no tiene hojas visibles', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Solo oculta').state = 'hidden';
      await expect(leerLibroExcel(await aBuffer(wb))).rejects.toThrow('hojas visibles');
    });
  });
});
