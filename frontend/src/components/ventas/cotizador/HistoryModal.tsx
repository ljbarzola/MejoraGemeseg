import { useMemo, useState } from 'react';
import { Copy, FolderOpen, Share2, Trash2 } from 'lucide-react';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { computeQuote } from '../../../utils/cotizador/pricing';
import { isoToDMY, money } from '../../../utils/cotizador/format';
import {
  COT_STATUS_COLOR,
  COT_STATUS_LABEL,
  COT_STATUS_ORDER,
  type CotProduct,
  type CotQuote,
  type CotStatus,
} from '../../../utils/cotizador/types';

const COLUMNAS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'estado', label: 'Estado' },
  { key: 'total', label: 'Total' },
];
const POR_DEFECTO = ['fecha', 'cliente', 'vendedor', 'estado', 'total'];
const ANCHO: Record<string, number> = {
  numero: 170,
  fecha: 100,
  cliente: 220,
  vendedor: 150,
  estado: 130,
  total: 110,
  acciones: 64,
};

const ACCESO_ETIQUETA: Record<string, string> = {
  shared: 'Compartida contigo',
  editor: 'Edición total',
  admin: 'Solo lectura (administrador)',
};

interface Props {
  quotes: CotQuote[];
  loading: boolean;
  error: string;
  byCode: ReadonlyMap<string, CotProduct>;
  onClose: () => void;
  onLoad: (q: CotQuote) => void;
  onStatus: (q: CotQuote, s: CotStatus) => void;
  onDelete: (q: CotQuote) => Promise<void>;
  onShare: (q: CotQuote) => void;
  onCopy: (q: CotQuote) => void;
}

export default function HistoryModal({
  quotes,
  loading,
  error,
  byCode,
  onClose,
  onLoad,
  onStatus,
  onDelete,
  onShare,
  onCopy,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [aEliminar, setAEliminar] = useState<CotQuote | null>(null);
  const [errorLocal, setErrorLocal] = useState('');

  const conTotal = useMemo(
    () =>
      quotes.map((q) => ({
        q,
        total: computeQuote({
          items: q.items,
          catalog: byCode,
          supplierMargins: q.supplierMargins,
          installMargin: q.installMargin,
          discountType: q.discountType,
          discountValue: q.discountValue,
        }).totals.total,
      })),
    [quotes, byCode],
  );

  // Los filtros viven en la cabecera de cada columna; el buscador general mira número, cliente y vendedor.
  const cf = useColumnFilters<(typeof conTotal)[number]>(conTotal, [
    { key: 'numero', etiqueta: 'Número', tipo: 'texto', getValue: (r) => r.q.quoteNumber },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (r) => r.q.quoteDate },
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'texto', getValue: (r) => r.q.client.name },
    { key: 'vendedor', etiqueta: 'Vendedor', tipo: 'valores', vacio: 'Sin vendedor', getValues: (r) => r.q.vendorName },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: COT_STATUS_ORDER,
      getValues: (r) => ({ valor: r.q.status, etiqueta: COT_STATUS_LABEL[r.q.status] }),
    },
    { key: 'total', etiqueta: 'Total', tipo: 'numero', getValue: (r) => r.total, formato: money },
  ]);

  const columnPrefs = useColumnPreferences('cotizador-historial', POR_DEFECTO);
  // Una columna oculta con filtro activo se muestra igual, para que se vea qué está filtrando.
  const visibles = useMemo(() => {
    const elegidas = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
    return [...elegidas, ...COLUMNAS.map((c) => c.key).filter((k) => !elegidas.includes(k) && cf.filtro(k))];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.filtro lee los filtros de ese momento; se recalcula cuando cambian.
  }, [columnPrefs.visible, cf.filtros]);
  const tablaRef = useResizableColumns('cotizador-historial', ['numero', ...visibles, 'acciones']);

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filtradas = useMemo(() => {
    const t = busqueda.toLowerCase().trim();
    if (!t) return cf.filas;
    return cf.filas.filter(({ q }) => (
      q.quoteNumber.toLowerCase().includes(t) ||
      (q.client.name || '').toLowerCase().includes(t) ||
      (q.vendorName || '').toLowerCase().includes(t)
    ));
  }, [cf.filas, busqueda]);

  const campos = useMemo(
    () => ({
      numero: (r: (typeof conTotal)[number]) => r.q.quoteNumber,
      fecha: (r: (typeof conTotal)[number]) => r.q.quoteDate,
      cliente: (r: (typeof conTotal)[number]) => r.q.client.name,
      vendedor: (r: (typeof conTotal)[number]) => r.q.vendorName,
      estado: (r: (typeof conTotal)[number]) => COT_STATUS_ORDER.indexOf(r.q.status),
      total: (r: (typeof conTotal)[number]) => r.total,
      creada: (r: (typeof conTotal)[number]) => r.q.createdAt,
    }),
    [],
  );
  const { filas, thProps, ordenDe } = useSortableTable(filtradas, campos, 'creada', 'desc');

  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiarTodo = () => {
    setBusqueda('');
    cf.limpiar();
  };
  const sumaTotal = filtradas.reduce((s, r) => s + r.total, 0);
  const porEstado = (s: CotStatus) => filtradas.filter((r) => r.q.status === s).length;

  const acciones = (q: CotQuote): RowAction[] => {
    const a: RowAction[] = [{ label: 'Cargar', icon: <FolderOpen size={14} />, onClick: () => onLoad(q) }];
    if (q.canShare) a.push({ label: 'Compartir', icon: <Share2 size={14} />, onClick: () => onShare(q) });
    if (q.access !== 'owner') a.push({ label: 'Crear copia', icon: <Copy size={14} />, onClick: () => onCopy(q) });
    if (q.canDelete) a.push({ label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setAEliminar(q) });
    return a;
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    try {
      await onDelete(aEliminar);
      setAEliminar(null);
    } catch {
      setAEliminar(null);
      setErrorLocal('No se pudo eliminar la cotización. Intenta de nuevo.');
    }
  };

  const th = (key: string, label: string) => (
    <th {...thProps(key)} style={{ width: ANCHO[key] }}>
      {label} 
      <ColumnFilter cf={cf} col={key} orden={ordenDe(key)} />
    </th>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-ventas-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-hist-title"
      >
        <div className="modal-header">
          <h3 id="cot-hist-title">📂 Historial de cotizaciones</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error || errorLocal} />

          <div className="cot-stats">
            <div className="cot-stat">
              <strong>{filtradas.length}</strong>
              <span>cotizaciones</span>
            </div>
            <div className="cot-stat">
              <strong>{money(sumaTotal)}</strong>
              <span>suma de totales</span>
            </div>
            {(['borrador', 'enviada', 'aceptada'] as CotStatus[]).map((s) => (
              <div className="cot-stat" key={s}>
                <strong>{porEstado(s)}</strong>
                <span>{COT_STATUS_LABEL[s].toLowerCase()}s</span>
              </div>
            ))}
          </div>

          <div className="filter-bar">
            <div className="filter-bar-fields">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por número, cliente o vendedor..."
                aria-label="Buscar en el historial"
                style={{ flex: '1 1 220px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
              />
            </div>
            <div className="filter-bar-actions">
              <ColumnPickerMenu
                columns={COLUMNAS}
                visible={visibles}
                fixedLabel="Número"
                onApply={(keys) => columnPrefs.set(keys)}
              />
              <ClearFiltersButton disabled={!hayFiltros} onClear={limpiarTodo} />
            </div>
          </div>

          <ChipsFiltros cf={cf} />

          {loading && <p className="cot-muted">Cargando cotizaciones...</p>}
          {!loading && quotes.length === 0 && (
            <div className="cot-empty">
              <div className="cot-empty-icon">📂</div>
              Aún no hay cotizaciones guardadas.
            </div>
          )}

          {quotes.length > 0 && (
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef}>
                <thead>
                  <tr>
                    {th('numero', 'Número')}
                    {visibles.map((k) => th(k, COLUMNAS.find((c) => c.key === k)!.label))}
                    <th className="col-acciones" title="Acciones">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <FilaSinResultados
                      columnas={visibles.length + 2}
                      mensaje="No hay cotizaciones con esos filtros."
                      onLimpiar={hayFiltros ? limpiarTodo : undefined}
                    />
                  )}
                  {filas.map(({ q, total }) => (
                    <tr key={q.id}>
                      <td>
                        <a
                          className="enlace-tabla"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            onLoad(q);
                          }}
                        >
                          {q.quoteNumber}
                        </a>
                        {ACCESO_ETIQUETA[q.access ?? ''] && (
                          <div className="cot-muted" style={{ fontSize: 11 }}>
                            {ACCESO_ETIQUETA[q.access ?? '']}
                          </div>
                        )}
                      </td>
                      {visibles.map((k) => {
                        if (k === 'fecha') return <td key={k}>{isoToDMY(q.quoteDate)}</td>;
                        if (k === 'cliente') return <td key={k} className="truncate">{q.client.name}</td>;
                        if (k === 'vendedor') return <td key={k} className="truncate">{q.vendorName}</td>;
                        if (k === 'total') return <td key={k} style={{ textAlign: 'right' }}>{money(total)}</td>;
                        // estado
                        return (
                          <td key={k}>
                            {q.canEdit ? (
                              <select
                                value={q.status}
                                onChange={(e) => onStatus(q, e.target.value as CotStatus)}
                                aria-label={`Estado de ${q.quoteNumber}`}
                                style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e0', fontSize: 12 }}
                              >
                                {COT_STATUS_ORDER.map((s) => (
                                  <option key={s} value={s}>
                                    {COT_STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className="cot-status"
                                style={{ background: COT_STATUS_COLOR[q.status] + '22', color: COT_STATUS_COLOR[q.status] }}
                              >
                                {COT_STATUS_LABEL[q.status]}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="col-acciones">
                        <RowActionsMenu actions={acciones(q)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {aEliminar && (
        <ConfirmDialog
          title="Eliminar cotización"
          message={`¿Eliminar la cotización ${aEliminar.quoteNumber}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
