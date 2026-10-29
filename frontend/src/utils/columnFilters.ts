// Lógica pura de los FILTROS DE COLUMNA (cabecera de las tablas de Ventas y CRM). Sin React ni DOM:
// se prueba con vitest (columnFilters.test.ts). La interfaz está en components/common/ColumnFilter.tsx y el
// hook que une las dos cosas, en hooks/useColumnFilters.ts.
//
// Un filtro de columna es uno de cuatro tipos, según lo que contiene la columna:
//  - 'valores': datos discretos (etapa, responsable, fuente…). Se eligen con casillas, como en Excel. El
//    estado es la lista de valores que SE MUESTRAN («incluir»); sin entrada = no hay filtro.
//  - 'fecha':   rango Desde/Hasta con atajos. Usa los mismos periodos que el Dashboard (rangoFechas.ts).
//  - 'numero':  mínimo y máximo.
//  - 'texto':   «contiene» (sin distinguir mayúsculas ni tildes).

import {
  ATAJOS_FECHA,
  diaEcuador,
  fechaEnRango,
  hayFiltroFecha,
  type FiltroFechaValor,
} from './rangoFechas';

export type TipoFiltroColumna = 'valores' | 'fecha' | 'numero' | 'texto';

/** Valor que representa «la fila no tiene dato» dentro de un filtro de 'valores'. */
export const VACIO = '__vacio__';

/** Un valor discreto de una fila: solo la clave, o la clave con el nombre que se muestra. */
export type ValorConEtiqueta = string | { valor: string; etiqueta: string };

export interface ColumnaFiltro<T> {
  /** La misma clave que usa la tabla para la columna (la de `thProps`). */
  key: string;
  /** Nombre de la columna: sale en el chip («Etapa: Cotizada»). */
  etiqueta: string;
  tipo: TipoFiltroColumna;
  /** 'valores': el valor (o varios, p. ej. los servicios de un contrato) de la fila. Sin dato → «vacío». */
  getValues?: (fila: T) => ValorConEtiqueta | ValorConEtiqueta[] | null | undefined;
  /** 'fecha' (texto ISO), 'numero' (número) y 'texto' (texto): el dato de la fila. */
  getValue?: (fila: T) => string | number | null | undefined;
  /** 'valores': claves en el orden en que se listan; las demás van después, de la A a la Z. */
  orden?: string[];
  /** 'valores': cómo se llama la fila sin dato («Sin asignar», «Sin clasificar»). Por defecto «(Vacías)». */
  vacio?: string;
  /** 'valores': cómo se llama un valor que hoy no tiene filas (p. ej. el que pidió un enlace de la URL); sin él se muestra la clave. */
  etiquetasConocidas?: Record<string, string>;
  /** 'fecha': el dato ya es un día sin hora (inicio de un contrato, fecha de una visita). */
  soloDia?: boolean;
  /**
   * 'fecha': si la fila es un TRAMO (un contrato que empieza en `getValue` y termina en `getFin`), el filtro pasa a
   * significar «en pie en algún momento del periodo»: empieza antes de que acabe el periodo y no termina antes de que
   * empiece. Sin fin (`null`) el tramo sigue abierto.
   */
  getFin?: (fila: T) => string | null | undefined;
  /** 'numero': cómo se escribe un monto en el chip. Por defecto, el número con separador de miles. */
  formato?: (n: number) => string;
}

export type FiltroValor =
  | { tipo: 'valores'; incluir: string[] }
  | { tipo: 'fecha'; fecha: FiltroFechaValor }
  | { tipo: 'numero'; min: string; max: string }
  | { tipo: 'texto'; texto: string };

export type FiltrosColumna = Record<string, FiltroValor>;

export interface OpcionValor {
  valor: string;
  etiqueta: string;
  conteo: number;
}

export interface ChipFiltro {
  key: string;
  columna: string;
  texto: string;
}

/** Minúsculas y sin tildes, para comparar texto como lo escribe una persona. */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Convierte «12,5» o «12.5» en número; null si no es un número. */
export function numeroDeTexto(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ¿El filtro limita algo? (Un filtro de valores con la lista vacía SÍ: significa «no mostrar nada».) */
export function filtroActivo(f: FiltroValor | undefined): boolean {
  if (!f) return false;
  switch (f.tipo) {
    case 'valores': return true;
    case 'fecha': return hayFiltroFecha(f.fecha);
    case 'numero': return numeroDeTexto(f.min) !== null || numeroDeTexto(f.max) !== null;
    case 'texto': return f.texto.trim() !== '';
  }
}

/** Los valores discretos de una fila para una columna 'valores' (sin repetir). Si no tiene, el valor VACIO. */
export function valoresDeFila<T>(col: ColumnaFiltro<T>, fila: T): { valor: string; etiqueta: string }[] {
  const crudo = col.getValues?.(fila);
  const lista = Array.isArray(crudo) ? crudo : crudo == null ? [] : [crudo];
  const salida: { valor: string; etiqueta: string }[] = [];
  for (const v of lista) {
    const par = typeof v === 'string' ? { valor: v, etiqueta: v } : v;
    const valor = String(par.valor ?? '').trim();
    if (valor === '' || salida.some((s) => s.valor === valor)) continue;
    salida.push({ valor, etiqueta: par.etiqueta || valor });
  }
  return salida.length > 0 ? salida : [{ valor: VACIO, etiqueta: col.vacio ?? '(Vacías)' }];
}

/** ¿Un tramo [inicio, fin] (días 'YYYY-MM-DD', sin hora; fin vacío = sigue abierto) se solapa con el filtro de fecha? */
export function tramoEnRango(inicio: string | null, fin: string | null, f: FiltroFechaValor): boolean {
  if (!hayFiltroFecha(f)) return true;
  if (!inicio) return false;
  const ini = inicio.slice(0, 10);
  const fi = fin ? fin.slice(0, 10) : null;
  if (f.hasta && ini > f.hasta) return false;
  if (f.desde && fi !== null && fi < f.desde) return false;
  return true;
}

/** ¿La fila cumple el filtro de esta columna? Un filtro de otro tipo que la columna no se aplica. */
export function cumpleFiltro<T>(col: ColumnaFiltro<T>, fila: T, f: FiltroValor): boolean {
  if (f.tipo !== col.tipo) return true;
  switch (f.tipo) {
    case 'valores':
      return valoresDeFila(col, fila).some((v) => f.incluir.includes(v.valor));
    case 'fecha': {
      const v = col.getValue?.(fila);
      if (col.getFin) return tramoEnRango(v == null || v === '' ? null : String(v), col.getFin(fila) ?? null, f.fecha);
      return fechaEnRango(v == null || v === '' ? null : String(v), f.fecha, col.soloDia);
    }
    case 'numero': {
      const min = numeroDeTexto(f.min);
      const max = numeroDeTexto(f.max);
      if (min === null && max === null) return true;
      const crudo = col.getValue?.(fila);
      if (crudo == null || crudo === '') return false;
      const n = Number(crudo);
      if (!Number.isFinite(n)) return false;
      return (min === null || n >= min) && (max === null || n <= max);
    }
    case 'texto': {
      const q = normalizar(f.texto.trim());
      if (!q) return true;
      return normalizar(String(col.getValue?.(fila) ?? '')).includes(q);
    }
  }
}

/** Filas que cumplen todos los filtros activos. `excepto`: una columna cuyo filtro se ignora (para sus conteos). */
export function aplicarFiltros<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  filtros: FiltrosColumna,
  excepto?: string,
): T[] {
  const activos = columnas.filter((c) => c.key !== excepto && filtroActivo(filtros[c.key]) && filtros[c.key].tipo === c.tipo);
  if (activos.length === 0) return filas;
  return filas.filter((fila) => activos.every((c) => cumpleFiltro(c, fila, filtros[c.key])));
}

/**
 * Las casillas de una columna 'valores': cada valor con cuántas filas lo tienen, contando las filas que
 * pasan los filtros de las OTRAS columnas (así el número es lo que saldría al elegirlo). Los valores que
 * ya están elegidos pero hoy no aparecen se listan con 0, para poder quitarlos.
 */
export function opcionesDeValores<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  filtros: FiltrosColumna,
  key: string,
): OpcionValor[] {
  const col = columnas.find((c) => c.key === key);
  if (!col || col.tipo !== 'valores') return [];
  const conteos = new Map<string, OpcionValor>();
  for (const fila of aplicarFiltros(filas, columnas, filtros, key)) {
    for (const v of valoresDeFila(col, fila)) {
      const previo = conteos.get(v.valor);
      if (previo) previo.conteo += 1;
      else conteos.set(v.valor, { valor: v.valor, etiqueta: v.etiqueta, conteo: 1 });
    }
  }
  const f = filtros[key];
  if (f?.tipo === 'valores') {
    const faltan = f.incluir.filter((v) => !conteos.has(v));
    if (faltan.length > 0) {
      const nombres = etiquetasDeColumna(filas, col);
      for (const v of faltan) conteos.set(v, { valor: v, etiqueta: nombres.get(v) ?? etiquetaDeVacio(col, v), conteo: 0 });
    }
  }
  const orden = col.orden ?? [];
  return [...conteos.values()].sort((a, b) => {
    if (a.valor === VACIO) return 1;
    if (b.valor === VACIO) return -1;
    const ia = orden.indexOf(a.valor);
    const ib = orden.indexOf(b.valor);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
    return a.etiqueta.localeCompare(b.etiqueta, 'es', { sensitivity: 'base' });
  });
}

const etiquetaDeVacio = <T,>(col: ColumnaFiltro<T>, valor: string) =>
  valor === VACIO ? col.vacio ?? '(Vacías)' : col.etiquetasConocidas?.[valor] ?? valor;

/** clave -> nombre que se muestra, de todos los valores que hay en las filas (sin filtrar). */
export function etiquetasDeColumna<T>(filas: T[], col: ColumnaFiltro<T>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const fila of filas) for (const v of valoresDeFila(col, fila)) if (!mapa.has(v.valor)) mapa.set(v.valor, v.etiqueta);
  return mapa;
}

/** Mínimo y máximo de una columna 'numero' (para sugerir el rango); null si no hay datos. */
export function rangoNumerico<T>(filas: T[], col: ColumnaFiltro<T>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const fila of filas) {
    const crudo = col.getValue?.(fila);
    if (crudo == null || crudo === '') continue;
    const n = Number(crudo);
    if (!Number.isFinite(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return min === Infinity ? null : { min, max };
}

// «01/10», o «01/10/25» si no es del año en curso.
const diaCorto = (iso: string, anio: string) => {
  const [y, m, d] = iso.split('-');
  return y === anio ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
};

/** Cómo se lee un filtro de fecha en un chip: «Este mes» si es un atajo, o «01/10–28/10». */
export function textoFecha(f: FiltroFechaValor, anio: string = diaEcuador().slice(0, 4)): string {
  const atajo = ATAJOS_FECHA.find((a) => a.value === f.atajo);
  if (atajo) return atajo.label;
  if (f.desde && f.hasta) return f.desde === f.hasta ? diaCorto(f.desde, anio) : `${diaCorto(f.desde, anio)}–${diaCorto(f.hasta, anio)}`;
  if (f.desde) return `desde ${diaCorto(f.desde, anio)}`;
  if (f.hasta) return `hasta ${diaCorto(f.hasta, anio)}`;
  return '';
}

const montoPorDefecto = (n: number) => n.toLocaleString('es-EC', { maximumFractionDigits: 2 });

/** Lo que dice el chip de un filtro, sin el nombre de la columna: «Cotizada», «Este mes», «≥ 100», «contiene «sol»». */
export function describirFiltro<T>(
  col: ColumnaFiltro<T>,
  f: FiltroValor,
  etiquetas: Map<string, string>,
  anio?: string,
): string {
  switch (f.tipo) {
    case 'valores': {
      if (f.incluir.length === 0) return 'ninguno';
      const nombres = f.incluir.map((v) => etiquetas.get(v) ?? etiquetaDeVacio(col, v));
      return nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} valores`;
    }
    case 'fecha':
      return textoFecha(f.fecha, anio);
    case 'numero': {
      const fmt = col.formato ?? montoPorDefecto;
      const min = numeroDeTexto(f.min);
      const max = numeroDeTexto(f.max);
      if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
      return min !== null ? `≥ ${fmt(min)}` : `≤ ${fmt(max ?? 0)}`;
    }
    case 'texto':
      return `contiene «${f.texto.trim()}»`;
  }
}

/** Los chips de los filtros activos, en el orden de las columnas. */
export function chipsDeFiltros<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  filtros: FiltrosColumna,
  anio?: string,
): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  for (const col of columnas) {
    const f = filtros[col.key];
    if (!f || f.tipo !== col.tipo || !filtroActivo(f)) continue;
    const etiquetas = f.tipo === 'valores' ? etiquetasDeColumna(filas, col) : new Map<string, string>();
    chips.push({ key: col.key, columna: col.etiqueta, texto: describirFiltro(col, f, etiquetas, anio) });
  }
  return chips;
}

// ---------- Enlaces profundos (?estado=…&desde=…) ----------

/** 'A,B' -> ['A','B'] (los parámetros de la URL pueden traer varios valores separados por coma). */
export const listaDeUrl = (v: string | null | undefined): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

export const filtroDeValores = (incluir: string[]): FiltroValor => ({ tipo: 'valores', incluir });
export const filtroDeFecha = (fecha: FiltroFechaValor): FiltroValor => ({ tipo: 'fecha', fecha });
