import type { CSSProperties, ReactNode } from 'react';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';

/**
 * Las tablas de listado de Cacao (proveedores, recepciones, lotes, liquidaciones…) comparten
 * la misma receta de la app: botón «Columnas», orden al hacer clic en el encabezado y ancho
 * de columnas que se arrastra. Se arma aquí una sola vez para que las 10 pantallas se
 * comporten igual y no copien 60 líneas cada una.
 *
 * Uso: la pantalla define sus columnas, pone `selectorColumnas` en su barra de filtros y
 * `tabla` donde iba su <table>.
 */
export interface ColumnaCacao<T> {
  key: string;
  label: string;
  /** Valor por el que se ordena al pulsar el encabezado. Sin él, la columna no ordena. */
  orden?: (fila: T) => string | number | null | undefined;
  /** Lo que se pinta en la celda. */
  celda: (fila: T) => ReactNode;
  /** Clase extra de la celda (p. ej. `tasks-table-title` en la columna principal). */
  clase?: string;
  /** Alinea el encabezado y las celdas a la derecha (cifras). */
  derecha?: boolean;
  /** Ancho inicial en px (por defecto 110). Con `table-layout: fixed`, una columna sin ancho queda aplastada por las que sí lo tienen. */
  ancho?: number;
}

const ANCHO_POR_DEFECTO = 110;

/** Ancho mínimo para que el encabezado (en mayúsculas, con el icono de orden) no se corte. */
const anchoDe = (c: { label: string; ancho?: number }) =>
  Math.max(c.ancho ?? ANCHO_POR_DEFECTO, Math.ceil((c.label.length + 2) * 11.2 + 22));

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
    columnas.map((c) => c.key),
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

  const campos: Record<string, (f: T) => string | number | null | undefined> = {};
  for (const c of [principal, ...columnas]) {
    if (c.orden) campos[c.key] = c.orden;
  }
  const { filas: ordenadas, thProps, SortIcon } = useSortableTable(
    filas,
    campos,
    ordenInicial,
    direccionInicial,
  );

  const encabezado = (c: ColumnaCacao<T>) => {
    const estilo = { ...(c.derecha ? { textAlign: 'right' as const } : {}), width: anchoDe(c) };
    return c.orden ? (
      <th key={c.key} {...thProps(c.key)} style={estilo}>{c.label} <SortIcon campo={c.key} /></th>
    ) : (
      <th key={c.key} style={estilo}>{c.label}</th>
    );
  };

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

  const tabla = (
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
  );

  return { tabla, selectorColumnas, filasOrdenadas: ordenadas };
}
