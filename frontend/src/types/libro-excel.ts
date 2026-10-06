/**
 * Un libro de Excel ya leído por el servidor para dibujarlo en pantalla como la
 * vista de Drive. Refleja `backend/src/common/utils/excel-hojas.util.ts`.
 */

/** Estilo de una celda; claves cortas porque se repite en miles de celdas. */
export interface EstiloCeldaExcel {
  f?: string; // relleno
  c?: string; // color del texto
  b?: 1; // negrita
  i?: 1; // cursiva
  u?: 1; // subrayado
  t?: 1; // tachado
  s?: number; // tamaño en pt (si no es el 11 por defecto)
  h?: 'left' | 'center' | 'right' | 'justify';
  v?: 'top' | 'middle' | 'bottom';
  w?: 1; // ajusta el texto
  bt?: string; // bordes, ya en CSS ("1px solid #000")
  bl?: string;
  bb?: string;
  br?: string;
}

/** [fila, columna, texto ya formateado, índice en `estilos`], base 0. */
export type CeldaExcel = [number, number, string, number];

export interface HojaExcel {
  nombre: string;
  /** Tamaño que se dibuja (el servidor lo acota). */
  filas: number;
  columnas: number;
  /** Tamaño real de la hoja en el archivo. */
  filasTotales: number;
  columnasTotales: number;
  /** Ancho en px de cada columna / alto en px de cada fila (null = alto automático). */
  anchos: number[];
  altos: (number | null)[];
  filasOcultas: number[];
  columnasOcultas: number[];
  congeladas: { filas: number; columnas: number };
  /** [fila1, col1, fila2, col2], base 0, extremos incluidos. */
  combinadas: [number, number, number, number][];
  celdas: CeldaExcel[];
}

export interface LibroExcel {
  hojas: HojaExcel[];
  /** `estilos[0]` es siempre el estilo vacío. */
  estilos: EstiloCeldaExcel[];
  truncado: boolean;
}
