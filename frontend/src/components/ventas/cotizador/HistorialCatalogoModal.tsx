import { useEffect, useMemo, useState } from 'react';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ErrorBanner from '../../common/ErrorBanner';
import ExportTableButton from '../../common/ExportTableButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { getCotHistorial, type CotCambio } from '../../../services/cotizador.service';
import { money } from '../../../utils/cotizador/format';
import { diaCortoEcuador } from '../../../utils/rangoFechas';

// Historial GENERAL de cambios del catálogo del Cotizador: qué se cambió, quién y cuándo.
// Solo lectura. Lo escribe el servidor al guardar un producto o servicio de instalación.
// Es una tabla como las demás: los filtros viven en la cabecera de cada columna.

// Clave propia: el historial de COTIZACIONES usa `cotizador-historial`. Si esta ventana usara la misma,
// las columnas que alguien eligió allá (p. ej. solo «Fecha») se aplicarían acá y parecería que faltan.
const CLAVE_COLUMNAS = 'cotizador-historial-catalogo';

const COLS = [
  { key: 'persona', label: 'Persona' },
  { key: 'producto', label: 'Producto' },
  { key: 'cambio', label: 'Qué cambió' },
  { key: 'antes', label: 'Antes' },
  { key: 'despues', label: 'Después' },
];
const DEF_COLS = ['persona', 'producto', 'cambio', 'antes', 'despues'];
const ANCHO: Record<string, number> = { fecha: 118, persona: 135, producto: 235, cambio: 150, antes: 100, despues: 100 };
const POR_PEDIDO = 200;
const MAX_PEDIDOS = 25; // 5.000 cambios: más que de sobra para una empresa

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const fechaHora = (iso: string) => `${diaCortoEcuador(iso)} ${hora(iso)}`;

const nombreEntidad = (c: CotCambio) => (c.entidad === 'PRODUCTO' ? 'producto' : 'servicio de instalación');

function cambioTexto(c: CotCambio): string {
  if (c.accion === 'CREO') return `Creó el ${nombreEntidad(c)}`;
  if (c.accion === 'ELIMINO') return `Eliminó el ${nombreEntidad(c)}`;
  return c.campoEtiqueta;
}

function valorTexto(c: CotCambio, v: string | null): string {
  if (c.accion !== 'EDITO') return '';
  if (v === null || v === '') return '(vacío)';
  if (c.campoTipo === 'dinero') return money(Number(v));
  if (c.campoTipo === 'si_no') return v === 'true' ? 'Sí' : 'No';
  return v;
}

export default function HistorialCatalogoModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<CotCambio[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  // Se trae todo el historial una vez y se filtra en la tabla, como las demás tablas del Cotizador.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let todos: CotCambio[] = [];
        let totalServidor = 0;
        for (let pagina = 1; pagina <= MAX_PEDIDOS; pagina++) {
          const r = await getCotHistorial({ pagina, limite: POR_PEDIDO });
          totalServidor = r.total;
          todos = todos.concat(r.items);
          if (todos.length >= r.total || r.items.length === 0) break;
        }
        if (!vivo) return;
        setItems(todos);
        setTotal(totalServidor);
      } catch {
        // Mensaje corto y fijo: el texto del servidor (p. ej. «Cannot GET ...») no le sirve a quien usa la pantalla
        if (vivo) setError('No se pudo cargar el historial. Cierra la ventana e inténtalo de nuevo; si sigue igual, avisa a Sistemas.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const cf = useColumnFilters<CotCambio>(items, [
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', getValue: (c) => c.creadoEn },
    { key: 'persona', etiqueta: 'Persona', tipo: 'valores', vacio: 'Sin persona', getValues: (c) => c.userNombre },
    { key: 'producto', etiqueta: 'Producto', tipo: 'texto', getValue: (c) => `${c.codigo} ${c.nombre}` },
    {
      key: 'cambio', etiqueta: 'Qué cambió', tipo: 'valores',
      getValues: (c) => ({ valor: c.accion === 'EDITO' ? c.campo : c.accion, etiqueta: cambioTexto(c).replace(/ el (producto|servicio de instalación)$/, ' un $1') }),
    },
    { key: 'antes', etiqueta: 'Antes', tipo: 'texto', getValue: (c) => valorTexto(c, c.valorAntes) },
    { key: 'despues', etiqueta: 'Después', tipo: 'texto', getValue: (c) => valorTexto(c, c.valorDespues) },
  ]);

  const prefs = useColumnPreferences(CLAVE_COLUMNAS, DEF_COLS);
  // Una columna oculta con filtro activo se muestra igual, para que se vea qué está filtrando.
  const visibles = useMemo(() => {
    const elegidas = prefs.visible.filter((k) => COLS.some((c) => c.key === k));
    return [...elegidas, ...COLS.map((c) => c.key).filter((k) => !elegidas.includes(k) && cf.filtro(k))];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.filtro lee los filtros de ese momento; se recalcula cuando cambian.
  }, [prefs.visible, cf.filtros]);
  const columnasTabla = ['fecha', ...visibles];
  const tablaRef = useResizableColumns(CLAVE_COLUMNAS, columnasTabla);

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filas = useMemo(() => {
    const t = q.toLowerCase().trim();
    return cf.filas.filter((c) => !t || c.codigo.toLowerCase().includes(t) || c.nombre.toLowerCase().includes(t));
  }, [cf.filas, q]);
  const hayFiltros = !!q || cf.hayFiltros;
  const limpiarTodo = () => {
    setQ('');
    cf.limpiar();
  };
  const incompleto = items.length < total;

  const exportColumns = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'persona', label: 'Persona' },
    { key: 'codigo', label: 'Código' },
    { key: 'producto', label: 'Producto' },
    { key: 'cambio', label: 'Qué cambió' },
    { key: 'antes', label: 'Antes' },
    { key: 'despues', label: 'Después' },
  ];
  const valorExport = (c: CotCambio, key: string): string => {
    switch (key) {
      case 'fecha': return fechaHora(c.creadoEn);
      case 'persona': return c.userNombre || '—';
      case 'codigo': return c.codigo;
      case 'producto': return c.nombre;
      case 'cambio': return cambioTexto(c);
      case 'antes': return valorTexto(c, c.valorAntes);
      default: return valorTexto(c, c.valorDespues);
    }
  };

  const th = (key: string, label: string) => (
    <th key={key} className="sortable-th" style={{ width: ANCHO[key] }}>
      {label} <ColumnFilter cf={cf} col={key} orden={cf.ordenDe(key)} />
    </th>
  );

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1050 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-hc-title">
        <div className="modal-header">
          <h3 id="cot-hc-title">Historial de cambios del catálogo</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body cot-camb-body">
          <p className="cot-camb-ayuda">
            Cada vez que alguien cambia un precio, el proveedor u otro dato de un producto o servicio, queda anotado aquí con su nombre. El historial
            empieza desde que se activó esta función.
          </p>
          <ErrorBanner mensaje={error} />
          <div className="filter-bar">
            <div className="filter-bar-fields">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por código o nombre del producto..."
                aria-label="Buscar en el historial"
                className="cot-cat-search"
              />
              <span className="cot-cat-count">{filas.length} cambios</span>
            </div>
            <div className="filter-bar-actions">
              <ColumnPickerMenu
                columns={COLS}
                visible={visibles}
                fixedLabel="Fecha"
                pinned={prefs.pinned}
                maxPinned={prefs.maxPinned}
                onApply={(k, fijas) => prefs.set(k, fijas)}
              />
              <ClearFiltersButton disabled={!hayFiltros} onClear={limpiarTodo} />
              <ExportTableButton
                titulo="Historial del catálogo"
                columns={exportColumns}
                defaultKeys={exportColumns.map((c) => c.key)}
                rows={filas}
                getValue={valorExport}
                disabled={incompleto}
                disabledTitle="El historial es muy largo y no se cargó completo; no se puede exportar"
              />
            </div>
          </div>
          <ChipsFiltros cf={cf} />

          <div className="tasks-table-wrapper cot-hist-wrap cot-camb-wrap" data-viva-en-modal="">
            <table
              className="tasks-table resizable-table"
              ref={tablaRef}
              data-fijas={prefs.fijas}
              style={{ minWidth: columnasTabla.reduce((s, k) => s + (ANCHO[k] ?? 120), 0) }}
            >
              <thead>
                <tr>
                  {th('fecha', 'Fecha')}
                  {visibles.map((k) => th(k, COLS.find((c) => c.key === k)!.label))}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={visibles.length + 1}
                    mensaje={
                      cargando
                        ? 'Cargando…'
                        : hayFiltros
                          ? 'No hay cambios con esos filtros.'
                          : 'Todavía no hay cambios anotados. Aparecerán aquí cuando alguien edite el catálogo.'
                    }
                    onLimpiar={hayFiltros && !cargando ? limpiarTodo : undefined}
                  />
                )}
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td className="cot-mono" style={{ fontSize: 12 }}>
                      {fechaHora(c.creadoEn)}
                    </td>
                    {visibles.map((k) => {
                      switch (k) {
                        case 'persona':
                          return <td key={k}>{c.userNombre || '—'}</td>;
                        case 'producto':
                          return (
                            <td key={k}>
                              <span className="truncate" title={`${c.codigo} — ${c.nombre}`}>
                                <span className="cot-mono">{c.codigo}</span> {c.nombre}
                              </span>
                            </td>
                          );
                        case 'cambio':
                          return (
                            <td key={k} className={c.esPrecio || c.accion !== 'EDITO' ? 'cot-camb-fuerte' : undefined}>
                              {cambioTexto(c)}
                            </td>
                          );
                        case 'antes':
                          return (
                            <td key={k} className={c.esPrecio ? 'cot-camb-fuerte' : undefined}>
                              {valorTexto(c, c.valorAntes) || '—'}
                            </td>
                          );
                        default:
                          return (
                            <td key={k} className={c.esPrecio ? 'cot-camb-fuerte' : undefined}>
                              {valorTexto(c, c.valorDespues) || '—'}
                            </td>
                          );
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {incompleto && (
            <span className="cot-cat-count">Se muestran los {items.length} cambios más recientes de {total}.</span>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
