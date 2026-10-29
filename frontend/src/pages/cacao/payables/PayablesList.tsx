import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getPayables, payPayable } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

export default function PayablesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'TRANSFER', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getPayables().then(setPayables).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function startPay(p: any) {
    setEditingId(p.id);
    const remaining = p.totalAmount - p.paidAmount;
    setPayForm({ amount: remaining.toFixed(2), method: 'TRANSFER', reference: '' });
  }

  async function handlePay() {
    if (!editingId || !payForm.amount) return;
    setSaving(true);
    setError('');
    try {
      await payPayable(editingId, {
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar pago');
    } finally { setSaving(false); }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas; siguen puestos tras registrar un pago).
  const cf = useColumnFilters<any>(payables, [
    { key: 'proveedor', etiqueta: 'Proveedor', tipo: 'valores', vacio: 'Sin proveedor', getValues: (p) => (p.supplier?.name ? { valor: String(p.supplier.id ?? p.supplier.name), etiqueta: p.supplier.name } : null) },
    { key: 'liquidacion', etiqueta: 'Liquidación', tipo: 'texto', getValue: (p) => (p.settlement?.id ? `#${p.settlement.id}` : '') },
    { key: 'total', etiqueta: 'Monto Total', tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => p.totalAmount },
    { key: 'pagado', etiqueta: 'Pagado', tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => p.paidAmount },
    { key: 'saldo', etiqueta: 'Saldo', tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => p.totalAmount - p.paidAmount },
    { key: 'vence', etiqueta: 'Fecha Vencimiento', tipo: 'fecha', soloDia: true, getValue: (p) => p.dueDate },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['PENDING', 'PARTIAL', 'PAID'],
      getValues: (p) => (p.status === 'PAID' ? { valor: 'PAID', etiqueta: 'Pagada' } : p.status === 'PARTIAL' ? { valor: 'PARTIAL', etiqueta: 'Parcial' } : { valor: 'PENDING', etiqueta: 'Pendiente' }),
    },
  ]);
  const filas = cf.filas;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Cuentas por Pagar</h1>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando cuentas por pagar...</div>
        ) : payables.length === 0 ? (
          <div className="empty-state">No hay cuentas por pagar.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Proveedor<ColumnFilter cf={cf} col="proveedor" orden={cf.ordenDe('proveedor')} /></th>
                  <th>Liquidación<ColumnFilter cf={cf} col="liquidacion" orden={cf.ordenDe('liquidacion')} /></th>
                  <th>Monto Total<ColumnFilter cf={cf} col="total" orden={cf.ordenDe('total')} /></th>
                  <th>Pagado<ColumnFilter cf={cf} col="pagado" orden={cf.ordenDe('pagado')} /></th>
                  <th>Saldo<ColumnFilter cf={cf} col="saldo" orden={cf.ordenDe('saldo')} /></th>
                  <th>Fecha Vencimiento<ColumnFilter cf={cf} col="vence" orden={cf.ordenDe('vence')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={8} mensaje="No hay cuentas por pagar que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((p) => {
                  const remaining = p.totalAmount - p.paidAmount;
                  return (
                    <tr key={p.id}>
                      <td>{p.supplier?.name || '—'}</td>
                      <td>{p.settlement?.id ? `#${p.settlement.id}` : '—'}</td>
                      <td>{fmt(p.totalAmount)}</td>
                      <td>{fmt(p.paidAmount)}</td>
                      <td style={{ fontWeight: 600, color: remaining > 0 ? '#e53e3e' : '#38a169' }}>{fmt(remaining)}</td>
                      <td>{formatDateEc(p.dueDate)}</td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: p.status === 'PAID' ? '#c6f6d5' : p.status === 'PARTIAL' ? '#fefcbf' : '#fed7d7',
                          color: p.status === 'PAID' ? '#276749' : p.status === 'PARTIAL' ? '#975a16' : '#9b2c2c',
                        }}>
                          {p.status === 'PAID' ? 'Pagada' : p.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                      <td>
                        {p.status !== 'PAID' && (
                          <button className="btn-sm-edit" onClick={() => startPay(p)}>Pagar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registrar Pago</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="auth-error-banner">{error}</div>}
              <div className="form-group">
                <label>Monto ($)</label>
                <input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Método de Pago</label>
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                </select>
              </div>
              <div className="form-group">
                <label>Referencia</label>
                <input type="text" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Nro. comprobante" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handlePay} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Pago'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
