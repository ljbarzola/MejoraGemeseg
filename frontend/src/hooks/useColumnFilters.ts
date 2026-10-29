import { useCallback, useMemo, useRef, useState } from 'react';
import {
  aplicarFiltros,
  chipsDeFiltros,
  describirFiltro,
  etiquetasDeColumna,
  filtroActivo,
  opcionesDeValores,
  rangoNumerico,
  valoresDeFila,
  VACIO,
  type ChipFiltro,
  type ColumnaFiltro,
  type FiltroValor,
  type FiltrosColumna,
  type OpcionValor,
  type TipoFiltroColumna,
} from '../utils/columnFilters';
import type { ControlOrden, SortDirection } from './useSortableTable';

/**
 * Lo que vale una fila para ordenar por una columna, leído como lo declaró para filtrar. `rango` sirve a las columnas de
 * 'valores' con `orden` (Abierto antes que Cerrado): se compara primero por él y luego por el valor.
 */
function claveDeOrden<T>(c: ColumnaFiltro<T>, fila: T): { vacio: boolean; rango: number; valor: string | number } {
  if (c.tipo === 'valores') {
    const v = valoresDeFila(c, fila)[0];
    if (!v || v.valor === VACIO) return { vacio: true, rango: 0, valor: '' };
    const i = c.orden ? c.orden.indexOf(v.valor) : -1;
    return { vacio: false, rango: c.orden ? (i >= 0 ? i : c.orden.length) : 0, valor: v.etiqueta };
  }
  const crudo = c.getValue?.(fila);
  if (crudo === null || crudo === undefined || crudo === '') return { vacio: true, rango: 0, valor: '' };
  if (c.tipo === 'numero') {
    const n = typeof crudo === 'number' ? crudo : Number(String(crudo).replace(',', '.'));
    return Number.isFinite(n) ? { vacio: false, rango: 0, valor: n } : { vacio: true, rango: 0, valor: '' };
  }
  return { vacio: false, rango: 0, valor: String(crudo) };
}

function ordenarFilas<T>(filas: T[], c: ColumnaFiltro<T>, dir: SortDirection): T[] {
  const signo = dir === 'asc' ? 1 : -1;
  return filas
    .map((fila) => ({ fila, k: claveDeOrden(c, fila) }))
    .sort((a, b) => {
      // Los vacíos siempre al final, en las dos direcciones.
      if (a.k.vacio || b.k.vacio) return a.k.vacio === b.k.vacio ? 0 : a.k.vacio ? 1 : -1;
      if (a.k.rango !== b.k.rango) return (a.k.rango - b.k.rango) * signo;
      const cmp = typeof a.k.valor === 'number' && typeof b.k.valor === 'number'
        ? a.k.valor - b.k.valor
        : String(a.k.valor).localeCompare(String(b.k.valor), 'es', { sensitivity: 'base' });
      return cmp * signo;
    })
    .map((x) => x.fila);
}

/**
 * Lo que necesita `<ColumnFilter>` para dibujar el filtro de una columna. Es la parte del hook que no
 * depende del tipo de fila, para que el componente no sea genérico.
 */
export interface ControlFiltros {
  /** ¿Esta columna tiene filtro declarado? (Si no, `<ColumnFilter>` no dibuja nada.) */
  tiene: (key: string) => boolean;
  etiqueta: (key: string) => string;
  tipo: (key: string) => TipoFiltroColumna | undefined;
  /** El filtro activo de la columna, o undefined. */
  filtro: (key: string) => FiltroValor | undefined;
  /** Pone el filtro de la columna; null lo quita. */
  fijar: (key: string, valor: FiltroValor | null) => void;
  /** 'valores': las casillas, con su conteo (calculado al pedirlas: solo se piden con el menú abierto). */
  opciones: (key: string) => OpcionValor[];
  /** 'numero': el menor y el mayor valor que hay en la tabla. */
  rango: (key: string) => { min: number; max: number } | null;
  /** Lo que dice el filtro activo («Cotizada», «Este mes»…), para el título del botón. */
  describir: (key: string) => string;
}

export interface ColumnFilters<T> extends ControlFiltros {
  /**
   * Las filas que cumplen los filtros de columna. Salen ordenadas solo si la pantalla usa `ordenDe` (las tablas que
   * ordenan con `useSortableTable` siguen igual: lo ordenan ellas).
   */
  filas: T[];
  /**
   * El orden de UNA columna para el botón único de la cabecera: `<ColumnFilter cf={cf} col="x" orden={cf.ordenDe('x')} />`.
   * Ordena con el mismo valor que la columna declaró para filtrar, así que no hay que repetirlo.
   */
  ordenDe: (key: string, etiquetas?: [string, string]) => ControlOrden;
  /** Cuántas filas había antes de filtrar. */
  total: number;
  filtros: FiltrosColumna;
  /** ¿Hay algún filtro de columna activo? */
  hayFiltros: boolean;
  /** Un chip por filtro activo, en el orden de las columnas. */
  chips: ChipFiltro[];
  /** Quita el filtro de una columna. */
  quitar: (key: string) => void;
  /** Suma filtros a los que ya hay (los enlaces profundos de la URL). */
  fijarVarios: (parcial: FiltrosColumna) => void;
  /** Quita todos los filtros de columna. */
  limpiar: () => void;
}

/**
 * Filtros de columna de una tabla: la pantalla declara qué columnas se filtran y cómo, y el hook entrega
 * las filas filtradas, el estado, los chips y la limpieza. Ver `<ColumnFilter>` y `<ChipsFiltros>`
 * (components/common/ColumnFilter.tsx) para la parte visual y la guía de uso completa.
 *
 *   const cf = useColumnFilters(leads, [
 *     { key: 'estado', etiqueta: 'Estado', tipo: 'valores', getValues: (l) => ({ valor: l.status, etiqueta: ESTADO[l.status] }) },
 *     { key: 'llego',  etiqueta: 'Llegó',  tipo: 'fecha',   getValue: (l) => l.createdAt },
 *   ], { inicial: { estado: filtroDeValores(['NUEVO']) } });
 *   const { filas } = useSortableTable(cf.filas, …);
 *
 * `columnas` puede ser un arreglo nuevo en cada render: el hook lo lee siempre al día.
 * `inicial` solo cuenta en el primer render (el filtro con el que abre la pantalla).
 */
export function useColumnFilters<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  opciones?: { inicial?: FiltrosColumna },
): ColumnFilters<T> {
  const [filtros, setFiltros] = useState<FiltrosColumna>(opciones?.inicial ?? {});
  const [orden, setOrden] = useState<{ campo: string; dir: SortDirection } | null>(null);
  // Siempre las columnas del último render, sin obligar a la pantalla a memorizarlas.
  const columnasRef = useRef(columnas);
  columnasRef.current = columnas;
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;

  const filtradas = useMemo(
    () => aplicarFiltros(filas, columnas, filtros),
    // `columnas` cambia de identidad en cada render a propósito: lo que mueve el resultado son las filas y los filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, filtros, columnas.map((c) => c.key).join('|')],
  );

  const ordenadas = useMemo(() => {
    const c = orden ? columnasRef.current.find((x) => x.key === orden.campo) : undefined;
    return orden && c ? ordenarFilas(filtradas, c, orden.dir) : filtradas;
    // `columnasRef` siempre trae las columnas del último render; lo que mueve el resultado es el orden y las filas.
  }, [filtradas, orden]);

  const col = (key: string) => columnasRef.current.find((c) => c.key === key);

  const fijar = useCallback((key: string, valor: FiltroValor | null) => {
    setFiltros((previo) => {
      const siguiente = { ...previo };
      // Un filtro de valores con la lista vacía significa «no mostrar nada»: es un filtro. Los demás, sin dato, se quitan.
      if (!valor || (valor.tipo !== 'valores' && !filtroActivo(valor))) delete siguiente[key];
      else siguiente[key] = valor;
      return siguiente;
    });
  }, []);

  const quitar = useCallback((key: string) => fijar(key, null), [fijar]);
  const limpiar = useCallback(() => setFiltros({}), []);
  const fijarVarios = useCallback((parcial: FiltrosColumna) => {
    if (Object.keys(parcial).length > 0) setFiltros((previo) => ({ ...previo, ...parcial }));
  }, []);

  const activos = columnas.filter((c) => filtroActivo(filtros[c.key]) && filtros[c.key].tipo === c.tipo);

  return {
    filas: ordenadas,
    ordenDe: (key, etiquetas) => ({
      campo: key,
      activo: orden?.campo === key ? orden.dir : null,
      fijar: (dir) => setOrden((previo) => (dir ? { campo: key, dir } : previo?.campo === key ? null : previo)),
      // Una columna con orden lógico (Abierto → Cerrado) no se lee como A → Z.
      etiquetas: etiquetas ?? (col(key)?.tipo === 'valores' && col(key)?.orden ? ['Orden lógico', 'Orden inverso'] : undefined),
    }),
    total: filas.length,
    filtros,
    hayFiltros: activos.length > 0,
    chips: chipsDeFiltros(filas, columnas, filtros),
    quitar,
    fijarVarios,
    limpiar,
    fijar,
    tiene: (key) => !!col(key),
    etiqueta: (key) => col(key)?.etiqueta ?? key,
    tipo: (key) => col(key)?.tipo,
    filtro: (key) => {
      const c = col(key);
      const f = filtrosRef.current[key];
      return c && f && f.tipo === c.tipo && filtroActivo(f) ? f : undefined;
    },
    opciones: (key) => opcionesDeValores(filasRef.current, columnasRef.current, filtrosRef.current, key),
    rango: (key) => {
      const c = col(key);
      return c ? rangoNumerico(filasRef.current, c) : null;
    },
    describir: (key) => {
      const c = col(key);
      const f = filtrosRef.current[key];
      if (!c || !f) return '';
      return describirFiltro(c, f, f.tipo === 'valores' ? etiquetasDeColumna(filasRef.current, c) : new Map());
    },
  };
}
