import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getPayables, payPayable, voidPayment } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoCuenta, apiErrorMessage } from '../utils';
import ErrorBanner from '../../../components/common/ErrorBanner';
import PaymentsHistoryModal from '../PaymentsHistoryModal';

export default function PayablesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'TRANSFER', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canVoid = getUser()?.role === 'ADMIN';

  const load = () => {
    setLoading(true);
    return getPayables().then(setPayables).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const editing = payables.find((p) => p.id === editingId);
  const remainingOf = (p: any) => Math.round((p.totalAmount - p.paidAmount) * 100) / 100;

  function startPay(p: any) {
    setError('');
    setEditingId(p.id);
    setPayForm({ amount: remainingOf(p).toFixed(2), method: 'TRANSFER', reference: '' });
  }

  async function handlePay() {
    if (!editing) return;
    const amount = Number(payForm.amount);
    if (!payForm.amount || !(amount > 0)) { setError('El monto debe ser mayor a cero'); return; }
    if (amount > remainingOf(editing) + 0.005) { setError(`El monto no puede superar el saldo pendiente ($${remainingOf(editing).toFixed(2)})`); return; }
    setSaving(true);
    setError('');
    try {
      await payPayable(editing.id, {
        amount,
        method: payForm.method,
        reference: payForm.reference.trim() || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo registrar el pago. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const history = payables.find((p) => p.id === historyId);

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
          <div className="empty-state">No hay cuentas por pagar. Se generan cuando se aprueba una liquidación.</div>
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
                {payables.map((p) => {
                  const remaining = remainingOf(p);
                  const estado = estadoCuenta(p.status);
                  const puedePagar = (p.status === 'PENDING' || p.status === 'PARTIAL') && p.settlement?.status === 'APPROVED';
                  return (
                    <tr key={p.id}>
                      <td>{p.supplier?.name || '—'}</td>
                      <td>{p.settlement?.id ? `LIQ-${String(p.settlement.id).padStart(4, '0')}` : '—'}</td>
                      <td>{fmt(p.totalAmount)}</td>
                      <td>{fmt(p.paidAmount)}</td>
                      <td style={{ fontWeight: 600, color: p.status === 'CANCELLED' ? '#718096' : remaining > 0 ? '#e53e3e' : '#38a169' }}>
                        {p.status === 'CANCELLED' ? '—' : fmt(remaining)}
                      </td>
                      <td>{formatDateEc(p.dueDate)}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {puedePagar && (
                            <button className="btn-sm-edit" onClick={() => startPay(p)}>Pagar</button>
                          )}
                          {p.payments?.length > 0 && (
                            <button className="btn-sm-edit" onClick={() => { setError(''); setHistoryId(p.id); }}>Pagos</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registrar Pago</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <ErrorBanner mensaje={error} />
              <p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: '13px' }}>
                {editing.supplier?.name} · Saldo pendiente {fmt(remainingOf(editing))}
              </p>
              <div className="form-group">
                <label>Monto ($)</label>
                <input type="number" step="0.01" min="0" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
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
                <input type="text" maxLength={120} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Nro. comprobante" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handlePay} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Pago'}</button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <PaymentsHistoryModal
          title={`Pagos de ${history.supplier?.name || 'la cuenta'}`}
          noun="pago"
          payments={history.payments || []}
          canVoid={canVoid}
          onVoid={async (paymentId, reason) => { await voidPayment(paymentId, reason); await load(); }}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}
