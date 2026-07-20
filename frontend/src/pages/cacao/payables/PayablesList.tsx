import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPayables, payPayable } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function PayablesList() {
  const navigate = useNavigate();
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

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Cuentas por Pagar</h1>
          </div>
        </div>
      </div>

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
                  <th>Proveedor</th>
                  <th>Liquidación</th>
                  <th>Monto Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  <th>Fecha Vencimiento</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((p) => {
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
