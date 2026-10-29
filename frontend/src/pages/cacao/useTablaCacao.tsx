import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Download, Search } from 'lucide-react';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import type { ColumnaFiltro } from '../../utils/columnFilters';
import { exportarExcel, type CeldaExcel, type TipoColumnaExcel } from './exportarExcel';

/**
 * Las tablas de listado de Cacao (proveedores, recepciones, lotes, liquidaciones…) comparten
 * la misma receta de la app: botón «Columnas», botón único de ordenar y filtrar en cada encabezado
 * (`filtro`), ancho de columnas que se arrastra, búsqueda y exportación a Excel. Se arma aquí una sola vez para que
 * las pantallas se comporten igual y no copien 60 líneas cada una.
 *
 * Uso: la pantalla define sus columnas, pone `buscador`, `selectorColumnas` y `botonExportar`
 * en su barra de filtros y `tabla` donde iba su <table>. `limpiarBusqueda` / `hayBusqueda`
 * son para su botón de limpiar filtros.
 */
export interface ColumnaCacao<T> {
  key: string;
  label: string;
  /** Valor por el que se ordena al pulsar el encabezado. Sin él, la columna no ordena. */
  orden?: (fila: T) => string | number | null | undefined;
  /**
   * Filtro de la columna en su encabezado (el botón único de ordenar y filtrar, igual que en las demás tablas
   * de la app). Se declara como en `useColumnFilters` sin `key` ni `etiqueta`: salen de la columna. Sin él, la
   * columna solo ordena (si tiene `orden`).
   */
  filtro?: Omit<ColumnaFiltro<T>, 'key' | 'etiqueta'>;
  /** Lo que se pinta en la celda. */
  celda: (fila: T) => ReactNode;
  /** Clase extra de la celda (p. ej. `tasks-table-title` en la columna principal). */
  clase?: string;
  /** Alinea el encabezado y las celdas a la derecha (cifras). */
  derecha?: boolean;
  /** Arranca oculta (cada persona la puede mostrar con «Columnas»). */
  ocultaPorDefecto?: boolean;
  /** Ancho inicial en px (por defecto 110). Con `table-layout: fixed`, una columna sin ancho queda aplastada por las que sí lo tienen. */
  ancho?: number;
  /**
   * Cómo sale en el Excel. Sin esto se usa el valor de `orden` (los números como número, el texto
   * como texto). `tipo: 'fecha'` convierte una marca de tiempo en fecha; `valor` sirve cuando lo
   * que se ordena no es lo que se quiere ver (un código, una etiqueta). `titulo` agrega la unidad.
   */
  excel?: { tipo?: TipoColumnaExcel; titulo?: string; valor?: (fila: T) => CeldaExcel };
}

const ANCHO_POR_DEFECTO = 110;

/** Ancho mínimo para que el encabezado (en mayúsculas, con el icono de orden) no se corte. */
const anchoDe = (c: { label: string; ancho?: number }) =>
  Math.max(c.ancho ?? ANCHO_POR_DEFECTO, Math.ceil((c.label.length + 2) * 11.2 + 22));

/** Minúsculas y sin tildes, para que «cooperativa» encuentre «Cooperativa» y «rio» encuentre «Río». */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function useTablaCacao<T>({
  clave,
  filas,
  principal,
  columnas,
  acciones,
  ordenInicial,
  direccionInicial = 'asc',
  idFila,
  estiloFila,
}: {
  /** Nombre único de la tabla: guarda por persona qué columnas ve (`columnas:cacao-<clave>`). */
  clave: string;
  filas: T[];
  /** Columna que siempre se ve y va primero (no se puede ocultar). */
  principal: ColumnaCacao<T>;
  /** Columnas que cada persona puede mostrar u ocultar, en su orden por defecto. */
  columnas: ColumnaCacao<T>[];
  /** Celda de acciones de la fila (botones). Sin ella no hay columna de acciones. */
  acciones?: (fila: T) => ReactNode;
  ordenInicial?: string;
  direccionInicial?: 'asc' | 'desc';
  idFila: (fila: T) => string | number;
  /** Estilo de toda la fila (p. ej. fondo verde en una fijación ya hecha). */
  estiloFila?: (fila: T) => CSSProperties | undefined;
}) {
  const columnPrefs = useColumnPreferences(
    `cacao-${clave}`,
    columnas.filter((c) => !c.ocultaPorDefecto).map((c) => c.key),
  );

  // Las keys guardadas que ya no existen (columna quitada en una versión nueva) se descartan.
  const visibles = columnPrefs.visible
    .map((key) => columnas.find((c) => c.key === key))
    .filter((c): c is ColumnaCacao<T> => !!c);

  // Las columnas cambian con el botón «Columnas»: los anchos guardados se ligan a la key de cada
  // una (no a su posición), si no, al ocultar una columna su ancho pasaría a la vecina.
  const tablaRef = useResizableColumns(
    `cacao-${clave}`,
    [principal.key, ...visibles.map((c) => c.key), ...(acciones ? ['acciones'] : [])],
  );

  // ─── Búsqueda: texto en cualquier columna (visible o no) cuyo valor sea texto o número ───
  const [busqueda, setBusqueda] = useState('');
  const consulta = normalizar(busqueda.trim());
  const todas = useMemo(() => [principal, ...columnas], [principal, columnas]);
  const filasBuscadas = useMemo(() => {
    if (!consulta) return filas;
    return filas.filter((f) =>
      todas.some((c) => {
        if (c.excel?.tipo === 'fecha') return false;
        const v = c.excel?.valor ? c.excel.valor(f) : c.orden?.(f);
        return (typeof v === 'string' || typeof v === 'number') && normalizar(String(v)).includes(consulta);
      }),
    );
  }, [filas, consulta, todas]);

  // ─── Filtros por columna (botón único de ordenar y filtrar): primero se filtra, luego se ordena ───
  const cf = useColumnFilters<T>(
    filasBuscadas,
    todas.filter((c) => c.filtro).map((c) => ({ key: c.key, etiqueta: c.label, ...c.filtro! }) as ColumnaFiltro<T>),
  );

  const campos: Record<string, (f: T) => string | number | null | undefined> = {};
  for (const c of [principal, ...columnas]) {
    if (c.orden) campos[c.key] = c.orden;
  }
  const { filas: ordenadas, thProps, ordenDe } = useSortableTable(
    cf.filas,
    campos,
    ordenInicial,
    direccionInicial,
  );

  // ─── Exportar a Excel: lo que se ve (columnas elegidas, filtro y orden actuales) ───
  const [exportando, setExportando] = useState(false);
  const [falloExportar, setFalloExportar] = useState(false);

  const valorExcel = (c: ColumnaCacao<T>, f: T): CeldaExcel => {
    if (c.excel?.valor) return c.excel.valor(f);
    const v = c.orden?.(f);
    if (c.excel?.tipo === 'fecha' && typeof v === 'number') return new Date(v);
    return v;
  };

  async function exportar() {
    setExportando(true);
    setFalloExportar(false);
    try {
      const cols = [principal, ...visibles];
      const datos = ordenadas.map((f) => cols.map((c) => valorExcel(c, f)));
      await exportarExcel({
        nombre: clave,
        columnas: cols.map((c, i) => {
          const primero = datos.map((d) => d[i]).find((v) => v !== null && v !== undefined && v !== '');
          const inferido: TipoColumnaExcel = typeof primero === 'number' ? 'numero' : primero instanceof Date ? 'fecha' : 'texto';
          return { titulo: c.excel?.titulo ?? c.label, tipo: c.excel?.tipo ?? inferido };
        }),
        filas: datos,
      });
    } catch {
      setFalloExportar(true);
    } finally {
      setExportando(false);
    }
  }

  const encabezado = (c: ColumnaCacao<T>) => {
    const estilo = { ...(c.derecha ? { textAlign: 'right' as const } : {}), width: anchoDe(c) };
    return c.orden ? (
      <th key={c.key} {...thProps(c.key)} style={estilo}>
        {c.label} <ColumnFilter cf={cf} col={c.key} etiqueta={c.label} orden={ordenDe(c.key)} />
      </th>
    ) : (
      <th key={c.key} style={estilo}>{c.label} {c.filtro && <ColumnFilter cf={cf} col={c.key} etiqueta={c.label} />}</th>
    );
  };

  const buscador = (
    <label style={{ position: 'relative', flex: '1 1 260px', minWidth: 0, maxWidth: 420 }}>
      <span className="visually-hidden">Buscar en la tabla</span>
      <Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0' }} />
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar…"
        style={{ width: '100%', padding: '10px 14px 10px 34px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem' }}
      />
    </label>
  );

  const selectorColumnas = (
    <ColumnPickerMenu
      columns={columnas.map((c) => ({ key: c.key, label: c.label }))}
      visible={columnPrefs.visible}
      pinned={columnPrefs.pinned}
      maxPinned={columnPrefs.maxPinned}
      fixedLabel={principal.label}
      onApply={async (keys, fijas) => { await columnPrefs.set(keys, fijas); }}
    />
  );

  // Siempre visible (no aparece ni desaparece): se desactiva cuando no hay filas que exportar.
  const botonExportar = (
    <button
      type="button"
      className="btn-secondary"
      onClick={exportar}
      disabled={exportando || ordenadas.length === 0}
      title={falloExportar ? 'No se pudo exportar. Inténtalo de nuevo.' : 'Descarga como Excel lo que ves en la tabla'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...(falloExportar ? { color: '#c53030' } : {}) }}
    >
      <Download size={14} aria-hidden />
      {exportando ? 'Exportando…' : falloExportar ? 'No se pudo exportar' : 'Exportar a Excel'}
    </button>
  );

  const hayFiltrosActivos = consulta !== '' || cf.hayFiltros;
  const columnasTotales = 1 + visibles.length + (acciones ? 1 : 0);

  const tabla = (
    <>
    <ChipsFiltros cf={cf} />
    <div className="tasks-table-wrapper">
      <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
        <thead>
          <tr>
            {encabezado(principal)}
            {visibles.map(encabezado)}
            {acciones && (
              <th className="col-acciones col-acciones--ancha no-print"><span className="visually-hidden">Acciones</span></th>
            )}
          </tr>
        </thead>
        <tbody>
          {ordenadas.length === 0 && filas.length > 0 && hayFiltrosActivos && (
            <FilaSinResultados
              columnas={columnasTotales}
              mensaje="Ningún registro coincide con la búsqueda y los filtros."
              onLimpiar={() => { setBusqueda(''); cf.limpiar(); }}
            />
          )}
          {ordenadas.map((f) => (
            <tr key={idFila(f)} style={estiloFila?.(f)}>
              <td className={principal.clase} style={principal.derecha ? { textAlign: 'right' } : undefined}>{principal.celda(f)}</td>
              {visibles.map((c) => (
                <td key={c.key} className={c.clase} style={c.derecha ? { textAlign: 'right' } : undefined}>{c.celda(f)}</td>
              ))}
              {acciones && <td className="col-acciones col-acciones--ancha no-print">{acciones(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );

  return {
    tabla,
    selectorColumnas,
    buscador,
    botonExportar,
    /** Quita lo escrito en el buscador y los filtros de columna (para el botón de limpiar filtros de la pantalla). */
    limpiarBusqueda: () => { setBusqueda(''); cf.limpiar(); },
    /** ¿Hay algo escrito en el buscador o algún filtro de columna puesto? */
    hayBusqueda: busqueda.trim() !== '' || cf.hayFiltros,
    /** Cuántas filas quedan tras buscar; 0 con filtros activos significa «nada coincide». */
    filasVisibles: ordenadas.length,
    filasOrdenadas: ordenadas,
  };
}
