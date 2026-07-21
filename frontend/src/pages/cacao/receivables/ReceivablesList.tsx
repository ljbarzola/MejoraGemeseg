import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getReceivables, receiveReceivable } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function ReceivablesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [receiveForm, setReceiveForm] = useState({ amount: '', method: 'TRANSFER', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getReceivables().then(setReceivables).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function startReceive(r: any) {
    setEditingId(r.id);
    const remaining = r.totalAmount - r.receivedAmount;
    setReceiveForm({ amount: remaining.toFixed(2), method: 'TRANSFER', reference: '' });
  }

  async function handleReceive() {
    if (!editingId || !receiveForm.amount) return;
    setSaving(true);
    setError('');
    try {
      await receiveReceivable(editingId, {
        amount: Number(receiveForm.amount),
        method: receiveForm.method,
        reference: receiveForm.reference || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar cobro');
    } finally { setSaving(false); }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Cuentas por Cobrar</h1>
          </div>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando cuentas por cobrar...</div>
        ) : receivables.length === 0 ? (
          <div className="empty-state">No hay cuentas por cobrar.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Embarque</th>
                  <th>Monto Total</th>
                  <th>Cobrado</th>
                  <th>Saldo</th>
                  <th>Fecha Vencimiento</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r) => {
                  const remaining = r.totalAmount - r.receivedAmount;
                  return (
                    <tr key={r.id}>
                      <td>{r.client?.name || '—'}</td>
                      <td>{r.shipment?.contractRef || '—'}</td>
                      <td>{fmt(r.totalAmount)}</td>
                      <td>{fmt(r.receivedAmount)}</td>
                      <td style={{ fontWeight: 600, color: remaining > 0 ? '#38a169' : '#718096' }}>{fmt(remaining)}</td>
                      <td>{formatDateEc(r.dueDate)}</td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: r.status === 'RECEIVED' ? '#c6f6d5' : r.status === 'PARTIAL' ? '#fefcbf' : '#bee3f8',
                          color: r.status === 'RECEIVED' ? '#276749' : r.status === 'PARTIAL' ? '#975a16' : '#2b6cb0',
                        }}>
                          {r.status === 'RECEIVED' ? 'Cobrada' : r.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                      <td>
                        {r.status !== 'RECEIVED' && (
                          <button className="btn-sm-edit" onClick={() => startReceive(r)}>Cobrar</button>
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
              <h3>Registrar Cobro</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="auth-error-banner">{error}</div>}
              <div className="form-group">
                <label>Monto ($)</label>
                <input type="number" step="0.01" value={receiveForm.amount} onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Método de Cobro</label>
                <select value={receiveForm.method} onChange={(e) => setReceiveForm({ ...receiveForm, method: e.target.value })}>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                </select>
              </div>
              <div className="form-group">
                <label>Referencia</label>
                <input type="text" value={receiveForm.reference} onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })} placeholder="Nro. comprobante" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleReceive} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Cobro'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
