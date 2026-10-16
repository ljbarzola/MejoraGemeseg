import { useMemo, useState } from 'react';
import { Copy, FolderOpen, Share2, Trash2 } from 'lucide-react';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ConfirmDialog from '../../common/ConfirmDialog';
import DateInput from '../../common/DateInput';
import ErrorBanner from '../../common/ErrorBanner';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
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
  const [cliente, setCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [aEliminar, setAEliminar] = useState<CotQuote | null>(null);
  const [errorLocal, setErrorLocal] = useState('');

  const columnPrefs = useColumnPreferences('cotizador-historial', POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('cotizador-historial', ['numero', ...visibles, 'acciones']);

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

  const filtradas = useMemo(() => {
    const c = cliente.toLowerCase().trim();
    const v = vendedor.toLowerCase().trim();
    return conTotal.filter(({ q }) => {
      if (c && !(q.client.name || '').toLowerCase().includes(c)) return false;
      if (v && !(q.vendorName || '').toLowerCase().includes(v)) return false;
      if (estado && q.status !== estado) return false;
      if (desde && q.quoteDate < desde) return false;
      if (hasta && q.quoteDate > hasta) return false;
      return true;
    });
  }, [conTotal, cliente, vendedor, estado, desde, hasta]);

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
  const { filas, thProps, SortIcon } = useSortableTable(filtradas, campos, 'creada', 'desc');

  const hayFiltros = !!(cliente || vendedor || desde || hasta || estado);
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
      {label} <SortIcon campo={key} />
    </th>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 1000, width: '96vw' }}
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
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Buscar cliente..."
                aria-label="Filtrar por cliente"
                style={{ flex: '1 1 160px', minWidth: 140, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
              />
              <input
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                placeholder="Buscar vendedor..."
                aria-label="Filtrar por vendedor"
                style={{ flex: '1 1 160px', minWidth: 140, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
              />
              <DateInput value={desde} onChange={setDesde} placeholder="Desde" />
              <DateInput value={hasta} onChange={setHasta} placeholder="Hasta" />
              <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
                <option value="">Todos los estados</option>
                {COT_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {COT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-bar-actions">
              <ColumnPickerMenu
                columns={COLUMNAS}
                visible={visibles}
                fixedLabel="Número"
                onApply={(keys) => columnPrefs.set(keys)}
              />
              <ClearFiltersButton
                disabled={!hayFiltros}
                onClear={() => {
                  setCliente('');
                  setVendedor('');
                  setDesde('');
                  setHasta('');
                  setEstado('');
                }}
              />
            </div>
          </div>

          {loading && <p className="cot-muted">Cargando cotizaciones...</p>}
          {!loading && filas.length === 0 && (
            <div className="cot-empty">
              <div className="cot-empty-icon">📂</div>
              {quotes.length === 0 ? 'Aún no hay cotizaciones guardadas.' : 'No hay cotizaciones con esos filtros.'}
            </div>
          )}

          {filas.length > 0 && (
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
