import ExcelJS from 'exceljs';

/**
 * Lee un .xlsx y lo deja como datos livianos para dibujarlo en pantalla como lo
 * hace la vista de Excel de Drive: cuadrícula con pestañas por hoja, paneles
 * congelados, celdas combinadas, colores, bordes y formatos de número. NO genera
 * ningún archivo: es una lectura en memoria, igual que la conversión a PDF.
 *
 * Lo que sí se respeta: valores (el resultado de las fórmulas), relleno, color,
 * negrita/cursiva/subrayado/tamaño, alineación, ajuste de texto, bordes, anchos,
 * altos, filas/columnas ocultas, celdas combinadas, paneles congelados y el
 * formato de número (moneda, porcentaje, decimales, fechas).
 * Lo que no: gráficos, imágenes, formato condicional, validaciones.
 */

/** Tope por hoja: una planilla enorme no debe tumbar el navegador. */
export const MAX_FILAS_VISTA = 1000;
export const MAX_COLUMNAS_VISTA = 80;

/**
 * Los archivos no dicen en qué idioma regional se verán: se usa el de la empresa
 * (punto de miles y coma decimal, como en Excel en español). `de-DE` y no `es-*`
 * porque el español no agrupa los miles de números de 4 cifras ("1234") y Excel sí.
 */
const LOCALE_NUMEROS = 'de-DE';

/** Estilo de una celda; claves cortas porque se repite en miles de celdas. */
export interface EstiloCelda {
  f?: string; // relleno #RRGGBB
  c?: string; // color del texto
  b?: 1; // negrita
  i?: 1; // cursiva
  u?: 1; // subrayado
  t?: 1; // tachado
  s?: number; // tamaño en pt (si no es el 11 por defecto)
  h?: 'left' | 'center' | 'right' | 'justify';
  v?: 'top' | 'middle' | 'bottom';
  w?: 1; // ajusta el texto
  bt?: string; // borde arriba, ya en CSS ("1px solid #000")
  bl?: string;
  bb?: string;
  br?: string;
}

/** [fila, columna, texto ya formateado, índice en `estilos`], base 0. */
export type CeldaVista = [number, number, string, number];

export interface HojaVista {
  nombre: string;
  /** Tamaño que se dibuja (acotado por MAX_*_VISTA). */
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
  /** [fila1, col1, fila2, col2], base 0, ambos extremos incluidos. */
  combinadas: [number, number, number, number][];
  celdas: CeldaVista[];
}

export interface LibroVista {
  hojas: HojaVista[];
  /** `estilos[0]` es siempre el estilo vacío. */
  estilos: EstiloCelda[];
  /** true si alguna hoja se recortó por los topes. */
  truncado: boolean;
}

// ------------------------------------------------------------------ colores

interface ColorExcel {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

// Paleta estándar de Office (los archivos que no traen tema propio la usan).
const TEMA_OFFICE = [
  'FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4',
  'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47',
];
const INDEXADOS = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF'];

function aplicarTinte(hex: string, tinte: number): string {
  const canales = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mezclados = canales.map((c) =>
    Math.round(tinte < 0 ? c * (1 + tinte) : c * (1 - tinte) + 255 * tinte),
  );
  return mezclados.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

/** `#RRGGBB`, o undefined si el color no se puede resolver o es transparente. */
export function colorCss(color: ColorExcel | undefined): string | undefined {
  if (!color) return undefined;
  if (color.argb && /^[0-9a-f]{8}$/i.test(color.argb)) {
    // Alfa 00 = transparente: Excel lo usa para "sin color".
    if (color.argb.slice(0, 2) === '00') return undefined;
    return `#${color.argb.slice(2).toUpperCase()}`;
  }
  if (typeof color.theme === 'number' && TEMA_OFFICE[color.theme]) {
    const base = TEMA_OFFICE[color.theme];
    return `#${(color.tint ? aplicarTinte(base, color.tint) : base).toUpperCase()}`;
  }
  if (typeof color.indexed === 'number' && INDEXADOS[color.indexed]) {
    return `#${INDEXADOS[color.indexed]}`;
  }
  return undefined;
}

// ------------------------------------------------------- formato de números

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const dos = (n: number) => String(n).padStart(2, '0');

/** Quita lo que no es un símbolo de fecha/hora (textos entre comillas, colores, relleno). */
const sinLiterales = (fmt: string) =>
  fmt.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, '');

export function esFormatoFecha(fmt: string | undefined): boolean {
  if (!fmt || fmt === 'General') return false;
  return /[ymdhs]/i.test(sinLiterales(fmt));
}

/** Fecha/hora según el formato de Excel (dd/mm/yyyy, d-mmm-yy, hh:mm AM/PM...). Usa UTC: así guarda Excel. */
export function formatearFecha(fecha: Date, fmt: string | undefined): string {
  const f = esFormatoFecha(fmt) ? (fmt as string) : 'dd/mm/yyyy';
  const partes = f.match(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*.|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|./gi) ?? [];
  const simbolos = partes.map((p) => p.toLowerCase());
  const esSimbolo = (p: string) => /^(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s)$/.test(p);
  const horas24 = fecha.getUTCHours();
  const ampm = simbolos.some((p) => p === 'am/pm' || p === 'a/p');

  let salida = '';
  partes.forEach((original, i) => {
    const p = simbolos[i];
    if (!esSimbolo(p) && p !== 'am/pm' && p !== 'a/p') {
      // Literal: texto entre comillas, \x, o separador. Lo demás de Excel se ignora.
      if (original.startsWith('"')) salida += original.slice(1, -1);
      else if (original.startsWith('\\')) salida += original.slice(1);
      else if (original.startsWith('[') || original.startsWith('_') || original.startsWith('*')) salida += '';
      else salida += original;
      return;
    }
    switch (p) {
      case 'yyyy': salida += fecha.getUTCFullYear(); break;
      case 'yy': salida += dos(fecha.getUTCFullYear() % 100); break;
      case 'mmmm': salida += MESES[fecha.getUTCMonth()]; break;
      case 'mmm': salida += MESES[fecha.getUTCMonth()].slice(0, 3); break;
      case 'dddd': salida += DIAS[fecha.getUTCDay()]; break;
      case 'ddd': salida += DIAS[fecha.getUTCDay()].slice(0, 3); break;
      case 'dd': salida += dos(fecha.getUTCDate()); break;
      case 'd': salida += fecha.getUTCDate(); break;
      case 'hh': salida += dos(ampm ? horas24 % 12 || 12 : horas24); break;
      case 'h': salida += ampm ? horas24 % 12 || 12 : horas24; break;
      case 'ss': salida += dos(fecha.getUTCSeconds()); break;
      case 's': salida += fecha.getUTCSeconds(); break;
      case 'am/pm':
      case 'a/p': salida += horas24 >= 12 ? 'PM' : 'AM'; break;
      case 'mm':
      case 'm': {
        // "m" es minuto (y no mes) si va justo después de las horas o antes de los segundos.
        const antes = [...simbolos.slice(0, i)].reverse().find(esSimbolo);
        const despues = simbolos.slice(i + 1).find(esSimbolo);
        const esMinuto = antes === 'h' || antes === 'hh' || despues === 's' || despues === 'ss';
        const valor = esMinuto ? fecha.getUTCMinutes() : fecha.getUTCMonth() + 1;
        salida += p === 'mm' ? dos(valor) : valor;
        break;
      }
      default: break;
    }
  });
  return salida;
}

function numeroGeneral(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  // Excel en "General" muestra hasta ~11 cifras significativas y sin separador de miles.
  return new Intl.NumberFormat(LOCALE_NUMEROS, {
    useGrouping: false,
    maximumFractionDigits: 10,
    maximumSignificantDigits: 11,
  }).format(n);
}

/**
 * Número según el formato de Excel: decimales, miles, porcentaje, moneda y
 * secciones positivo;negativo;cero. Un formato raro (fracciones, notación
 * científica) se muestra en "General" en vez de inventar algo incorrecto.
 */
export function formatearNumero(n: number, fmt: string | undefined): string {
  if (!fmt || fmt === 'General' || !Number.isFinite(n)) return numeroGeneral(n);

  const secciones = fmt.split(';');
  if (secciones[0].trim().toLowerCase() === 'general') return numeroGeneral(n);
  let seccion = secciones[0];
  if (n < 0 && secciones.length > 1) seccion = secciones[1];
  else if (n === 0 && secciones.length > 2) seccion = secciones[2];
  const signo = n < 0 && secciones.length === 1 ? '-' : '';
  let valor = Math.abs(n);

  type Parte = { lit: string } | { num: string };
  const partes: Parte[] = [];
  let i = 0;
  let hayNumero = false;
  let porcentaje = false;
  while (i < seccion.length) {
    const ch = seccion[i];
    if (ch === '"') {
      const fin = seccion.indexOf('"', i + 1);
      const texto = seccion.slice(i + 1, fin === -1 ? undefined : fin);
      partes.push({ lit: texto });
      i = fin === -1 ? seccion.length : fin + 1;
    } else if (ch === '\\') {
      partes.push({ lit: seccion[i + 1] ?? '' });
      i += 2;
    } else if (ch === '[') {
      const fin = seccion.indexOf(']', i);
      const dentro = seccion.slice(i + 1, fin === -1 ? undefined : fin);
      // [$€-407] = símbolo de moneda; [Red], [>100]... no cambian el texto.
      if (dentro.startsWith('$')) partes.push({ lit: dentro.slice(1).split('-')[0] });
      i = fin === -1 ? seccion.length : fin + 1;
    } else if (ch === '_' || ch === '*') {
      if (ch === '_') partes.push({ lit: ' ' });
      i += 2;
    } else if (/[0#?,.]/.test(ch)) {
      let j = i;
      while (j < seccion.length && /[0#?,.]/.test(seccion[j])) j++;
      if (hayNumero) return numeroGeneral(n); // dos bloques numéricos: fracción u otro caso raro
      hayNumero = true;
      partes.push({ num: seccion.slice(i, j) });
      i = j;
    } else if (ch === '%') {
      porcentaje = true;
      partes.push({ lit: '%' });
      i++;
    } else if (/[eE]/.test(ch) && /[+-]/.test(seccion[i + 1] ?? '')) {
      return numeroGeneral(n); // notación científica
    } else if (ch === '/') {
      return numeroGeneral(n); // fracción (# ?/?)
    } else {
      partes.push({ lit: ch });
      i++;
    }
  }
  if (!hayNumero) {
    // Formato solo de texto (ej. "Pendiente"): lo que dice el formato.
    return partes.map((p) => ('lit' in p ? p.lit : '')).join('') || numeroGeneral(n);
  }

  if (porcentaje) valor *= 100;
  return (
    signo +
    partes
      .map((p) => {
        if ('lit' in p) return p.lit;
        const [entera, decimal = ''] = p.num.split('.');
        const decimales = decimal.replace(/,/g, '');
        const ceros = (decimales.match(/0/g) ?? []).length;
        return new Intl.NumberFormat(LOCALE_NUMEROS, {
          useGrouping: entera.includes(','),
          minimumIntegerDigits: Math.max(1, (entera.match(/0/g) ?? []).length),
          minimumFractionDigits: ceros,
          maximumFractionDigits: decimales.length,
        }).format(valor);
      })
      .join('')
  );
}

// ------------------------------------------------------------------ celdas

/** Lo que Excel muestra en la celda, ya como texto. */
function textoDeCelda(cell: ExcelJS.Cell): { texto: string; tipo: 'numero' | 'texto' | 'centro' } {
  let v: unknown = cell.value;
  if (cell.type === ExcelJS.ValueType.Formula) {
    v = (cell.value as { result?: unknown }).result;
  }
  if (v === null || v === undefined) return { texto: '', tipo: 'texto' };
  if (v instanceof Date) {
    return { texto: formatearFecha(v, cell.numFmt), tipo: 'numero' };
  }
  if (typeof v === 'number') {
    // Fecha guardada como número de serie con un formato que ExcelJS no reconoce como fecha.
    if (esFormatoFecha(cell.numFmt)) {
      const fecha = new Date(Math.round((v - 25569) * 86400 * 1000));
      return { texto: formatearFecha(fecha, cell.numFmt), tipo: 'numero' };
    }
    return { texto: formatearNumero(v, cell.numFmt), tipo: 'numero' };
  }
  if (typeof v === 'boolean') return { texto: v ? 'VERDADERO' : 'FALSO', tipo: 'centro' };
  if (typeof v === 'string') return { texto: v, tipo: 'texto' };
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; error?: string; result?: unknown };
    if (o.richText) return { texto: o.richText.map((r) => r.text).join(''), tipo: 'texto' };
    if (typeof o.error === 'string') return { texto: o.error, tipo: 'centro' };
    if (o.text !== undefined) return { texto: String(o.text), tipo: 'texto' };
  }
  return { texto: String(v), tipo: 'texto' };
}

const ESTILO_BORDE: Record<string, string> = {
  thin: '1px solid',
  hair: '1px solid',
  medium: '2px solid',
  thick: '3px solid',
  dotted: '1px dotted',
  dashed: '1px dashed',
  mediumDashed: '2px dashed',
  dashDot: '1px dashed',
  mediumDashDot: '2px dashed',
  dashDotDot: '1px dotted',
  mediumDashDotDot: '2px dotted',
  slantDashDot: '2px dashed',
  double: '3px double',
};

function bordeCss(b: Partial<ExcelJS.Border> | undefined): string | undefined {
  if (!b?.style) return undefined;
  const base = ESTILO_BORDE[b.style] ?? '1px solid';
  return `${base} ${colorCss(b.color as ColorExcel | undefined) ?? '#000000'}`;
}

function estiloDe(cell: ExcelJS.Cell, tipo: 'numero' | 'texto' | 'centro'): EstiloCelda {
  const e: EstiloCelda = {};

  const font = cell.font;
  if (font) {
    if (font.bold) e.b = 1;
    if (font.italic) e.i = 1;
    if (font.underline) e.u = 1;
    if (font.strike) e.t = 1;
    if (font.size && font.size !== 11) e.s = font.size;
    const c = colorCss(font.color as ColorExcel | undefined);
    if (c && c !== '#000000') e.c = c;
  }

  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const f = colorCss(fill.fgColor as ColorExcel | undefined);
    if (f && f !== '#FFFFFF') e.f = f;
  }

  const borde = cell.border;
  if (borde) {
    const bt = bordeCss(borde.top);
    const bl = bordeCss(borde.left);
    const bb = bordeCss(borde.bottom);
    const br = bordeCss(borde.right);
    if (bt) e.bt = bt;
    if (bl) e.bl = bl;
    if (bb) e.bb = bb;
    if (br) e.br = br;
  }

  const al = cell.alignment;
  const h = al?.horizontal;
  if (h === 'left' || h === 'center' || h === 'right' || h === 'justify') e.h = h;
  else if (h === 'centerContinuous') e.h = 'center';
  else if (!h || h === 'fill' || h === 'distributed') {
    // "General" de Excel: los números van a la derecha y lo lógico al centro.
    if (tipo === 'numero') e.h = 'right';
    else if (tipo === 'centro') e.h = 'center';
  }
  const v = al?.vertical;
  if (v === 'top' || v === 'middle' || v === 'bottom') e.v = v;
  else if (v === 'distributed' || v === 'justify') e.v = 'middle';
  if (al?.wrapText) e.w = 1;

  return e;
}

const aPx = {
  ancho: (caracteres: number) => Math.round(caracteres * 7 + 5),
  alto: (puntos: number) => Math.round((puntos * 4) / 3),
};

/** "B3" → [fila0, col0]; devuelve null si no es una dirección. */
function direccion(ref: string): [number, number] | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

/**
 * Lee el libro. Lanza si el archivo no es un .xlsx válido (o tiene contraseña):
 * quien llama debe tener otra vía (la conversión a PDF) para ese caso.
 */
export async function leerLibroExcel(buffer: Buffer): Promise<LibroVista> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const estilos: EstiloCelda[] = [{}];
  const indicePorEstilo = new Map<string, number>([['{}', 0]]);
  const idEstilo = (e: EstiloCelda): number => {
    const clave = JSON.stringify(e);
    const existente = indicePorEstilo.get(clave);
    if (existente !== undefined) return existente;
    estilos.push(e);
    indicePorEstilo.set(clave, estilos.length - 1);
    return estilos.length - 1;
  };

  let truncado = false;
  const hojas: HojaVista[] = [];

  for (const ws of libro.worksheets) {
    if (ws.state !== 'visible') continue; // las ocultas no se muestran, igual que en Drive

    const filasTotales = ws.rowCount;
    const columnasTotales = ws.columnCount;
    const filas = Math.min(filasTotales, MAX_FILAS_VISTA);
    const columnas = Math.min(columnasTotales, MAX_COLUMNAS_VISTA);
    if (filas < filasTotales || columnas < columnasTotales) truncado = true;

    const anchos: number[] = [];
    const columnasOcultas: number[] = [];
    for (let c = 1; c <= columnas; c++) {
      const col = ws.getColumn(c);
      anchos.push(aPx.ancho(col.width ?? 8.43));
      if (col.hidden) columnasOcultas.push(c - 1);
    }

    const altos: (number | null)[] = [];
    const filasOcultas: number[] = [];
    const celdas: CeldaVista[] = [];
    for (let r = 1; r <= filas; r++) {
      const row = ws.getRow(r);
      altos.push(row.height ? aPx.alto(row.height) : null);
      if (row.hidden) filasOcultas.push(r - 1);
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        if (c > columnas) return;
        // Las celdas cubiertas por una combinada repiten el texto de la principal: no se envían.
        if (cell.type === ExcelJS.ValueType.Merge) return;
        const { texto, tipo } = textoDeCelda(cell);
        const id = idEstilo(estiloDe(cell, tipo));
        if (texto === '' && id === 0) return; // celda vacía y sin formato: no aporta nada
        celdas.push([r - 1, c - 1, texto, id]);
      });
    }

    const combinadas: [number, number, number, number][] = [];
    for (const rango of (ws.model.merges as string[] | undefined) ?? []) {
      const [ini, fin] = rango.split(':');
      const a = direccion(ini);
      const b = direccion(fin ?? ini);
      if (!a || !b || a[0] >= filas || a[1] >= columnas) continue;
      combinadas.push([a[0], a[1], Math.min(b[0], filas - 1), Math.min(b[1], columnas - 1)]);
    }

    const vista = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined;
    const congelada = vista?.state === 'frozen';

    hojas.push({
      nombre: ws.name,
      filas,
      columnas,
      filasTotales,
      columnasTotales,
      anchos,
      altos,
      filasOcultas,
      columnasOcultas,
      congeladas: {
        filas: congelada ? Math.min(vista?.ySplit ?? 0, filas) : 0,
        columnas: congelada ? Math.min(vista?.xSplit ?? 0, columnas) : 0,
      },
      combinadas,
      celdas,
    });
  }

  if (hojas.length === 0) {
    throw new Error('El libro no tiene hojas visibles.');
  }
  return { hojas, estilos, truncado };
}
