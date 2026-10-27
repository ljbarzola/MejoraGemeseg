import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { getPayables, payPayable, voidPayment } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoCuenta, apiErrorMessage } from '../utils';
import ErrorBanner from '../../../components/common/ErrorBanner';
import PaymentsHistoryModal from '../PaymentsHistoryModal';
import { useTablaCacao } from '../useTablaCacao';

export default function PayablesList() {
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

  const { tabla, selectorColumnas } = useTablaCacao<any>({
    clave: 'cuentas-por-pagar',
    filas: payables,
    idFila: (p) => p.id,
    ordenInicial: 'vence',
    principal: { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (p) => p.supplier?.name, celda: (p) => p.supplier?.name || '—' },
    columnas: [
      {
        key: 'liquidacion', ancho: 120,
        label: 'Liquidación',
        orden: (p) => p.settlement?.id,
        celda: (p) => (p.settlement?.id ? `LIQ-${String(p.settlement.id).padStart(4, '0')}` : '—'),
      },
      { key: 'total', label: 'Monto Total', orden: (p) => p.totalAmount, celda: (p) => fmt(p.totalAmount) },
      { key: 'pagado', label: 'Pagado', orden: (p) => p.paidAmount, celda: (p) => fmt(p.paidAmount) },
      {
        key: 'saldo',
        label: 'Saldo',
        orden: (p) => (p.status === 'CANCELLED' ? null : remainingOf(p)),
        celda: (p) => {
          const remaining = remainingOf(p);
          return (
            <span style={{ fontWeight: 600, color: p.status === 'CANCELLED' ? '#718096' : remaining > 0 ? '#e53e3e' : '#38a169' }}>
              {p.status === 'CANCELLED' ? '—' : fmt(remaining)}
            </span>
          );
        },
      },
      { key: 'vence', ancho: 140, label: 'Fecha Vencimiento', orden: (p) => new Date(p.dueDate).getTime(), celda: (p) => formatDateEc(p.dueDate) },
      {
        key: 'estado', ancho: 120,
        label: 'Estado',
        orden: (p) => estadoCuenta(p.status).label,
        celda: (p) => {
          const estado = estadoCuenta(p.status);
          return <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>;
        },
      },
    ],
    acciones: (p) => {
      const puedePagar = (p.status === 'PENDING' || p.status === 'PARTIAL') && p.settlement?.status === 'APPROVED';
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {puedePagar && <button className="btn-sm-edit" onClick={() => startPay(p)}>Pagar</button>}
          {p.payments?.length > 0 && (
            <button className="btn-sm-edit" onClick={() => { setError(''); setHistoryId(p.id); }}>Pagos</button>
          )}
        </div>
      );
    },
  });

  return (
    <div className="page-container">
      <PageHeader eyebrow="Cacao" title="Cuentas por Pagar" description="Lo que debes a tus proveedores. Cada cuenta nace cuando se aprueba una liquidación." />

      <div className="filter-bar">
        <div className="filter-bar-fields" />
        <div className="filter-bar-actions">{selectorColumnas}</div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando cuentas por pagar...</div>
        ) : payables.length === 0 ? (
          <div className="empty-state">No hay cuentas por pagar. Se generan cuando se aprueba una liquidación.</div>
        ) : (
          tabla
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
