import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { getReceivables, receiveReceivable, voidReceipt } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoCuenta, apiErrorMessage } from '../utils';
import ErrorBanner from '../../../components/common/ErrorBanner';
import PaymentsHistoryModal from '../PaymentsHistoryModal';

export default function ReceivablesList() {
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [receiveForm, setReceiveForm] = useState({ amount: '', method: 'TRANSFER', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canVoid = getUser()?.role === 'ADMIN';

  const load = () => {
    setLoading(true);
    return getReceivables().then(setReceivables).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const editing = receivables.find((r) => r.id === editingId);
  const remainingOf = (r: any) => Math.round((r.totalAmount - r.receivedAmount) * 100) / 100;

  function startReceive(r: any) {
    setError('');
    setEditingId(r.id);
    setReceiveForm({ amount: remainingOf(r).toFixed(2), method: 'TRANSFER', reference: '' });
  }

  async function handleReceive() {
    if (!editing) return;
    const amount = Number(receiveForm.amount);
    if (!receiveForm.amount || !(amount > 0)) { setError('El monto debe ser mayor a cero'); return; }
    if (amount > remainingOf(editing) + 0.005) { setError(`El monto no puede superar el saldo pendiente ($${remainingOf(editing).toFixed(2)})`); return; }
    setSaving(true);
    setError('');
    try {
      await receiveReceivable(editing.id, {
        amount,
        method: receiveForm.method,
        reference: receiveForm.reference.trim() || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo registrar el cobro. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const history = receivables.find((r) => r.id === historyId);

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas; siguen puestos tras registrar un cobro).
  const cf = useColumnFilters<any>(receivables, [
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', vacio: 'Sin cliente', getValues: (r) => (r.client?.name ? { valor: String(r.client.id ?? r.client.name), etiqueta: r.client.name } : null) },
    { key: 'embarque', etiqueta: 'Embarque', tipo: 'texto', getValue: (r) => r.shipment?.contractRef },
    { key: 'total', etiqueta: 'Monto Total', tipo: 'numero', formato: (n) => fmt(n), getValue: (r) => r.totalAmount },
    { key: 'cobrado', etiqueta: 'Cobrado', tipo: 'numero', formato: (n) => fmt(n), getValue: (r) => r.receivedAmount },
    { key: 'saldo', etiqueta: 'Saldo', tipo: 'numero', formato: (n) => fmt(n), getValue: (r) => r.totalAmount - r.receivedAmount },
    { key: 'vence', etiqueta: 'Fecha Vencimiento', tipo: 'fecha', soloDia: true, getValue: (r) => r.dueDate },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['PENDING', 'PARTIAL', 'RECEIVED'],
      getValues: (r) => (r.status === 'RECEIVED' ? { valor: 'RECEIVED', etiqueta: 'Cobrada' } : r.status === 'PARTIAL' ? { valor: 'PARTIAL', etiqueta: 'Parcial' } : { valor: 'PENDING', etiqueta: 'Pendiente' }),
    },
  ]);
  const filas = cf.filas;

  return (
    <div className="page-container">
      <PageHeader eyebrow="Cacao" title="Cuentas por Cobrar" description="Lo que te deben tus clientes. Cada cuenta nace con un embarque." />

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

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
                  <th>Cliente<ColumnFilter cf={cf} col="cliente" orden={cf.ordenDe('cliente')} /></th>
                  <th>Embarque<ColumnFilter cf={cf} col="embarque" orden={cf.ordenDe('embarque')} /></th>
                  <th>Monto Total<ColumnFilter cf={cf} col="total" orden={cf.ordenDe('total')} /></th>
                  <th>Cobrado<ColumnFilter cf={cf} col="cobrado" orden={cf.ordenDe('cobrado')} /></th>
                  <th>Saldo<ColumnFilter cf={cf} col="saldo" orden={cf.ordenDe('saldo')} /></th>
                  <th>Fecha Vencimiento<ColumnFilter cf={cf} col="vence" orden={cf.ordenDe('vence')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r) => {
                  const remaining = remainingOf(r);
                  const estado = estadoCuenta(r.status);
                  return (
                    <tr key={r.id}>
                      <td>{r.client?.name || '—'}</td>
                      <td>{r.shipment?.contractRef || '—'}</td>
                      <td>{fmt(r.totalAmount)}</td>
                      <td>{fmt(r.receivedAmount)}</td>
                      <td style={{ fontWeight: 600, color: remaining > 0 ? '#38a169' : '#718096' }}>{fmt(remaining)}</td>
                      <td>{formatDateEc(r.dueDate)}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {r.status !== 'RECEIVED' && (
                            <button className="btn-sm-edit" onClick={() => startReceive(r)}>Cobrar</button>
                          )}
                          {r.payments?.length > 0 && (
                            <button className="btn-sm-edit" onClick={() => { setError(''); setHistoryId(r.id); }}>Cobros</button>
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
              <h3>Registrar Cobro</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <ErrorBanner mensaje={error} />
              <p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: '13px' }}>
                {editing.client?.name} · Saldo pendiente {fmt(remainingOf(editing))}
              </p>
              <div className="form-group">
                <label>Monto ($)</label>
                <input type="number" step="0.01" min="0" value={receiveForm.amount} onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
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
                <input type="text" maxLength={120} value={receiveForm.reference} onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })} placeholder="Nro. comprobante" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleReceive} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Cobro'}</button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <PaymentsHistoryModal
          title={`Cobros de ${history.client?.name || 'la cuenta'}`}
          noun="cobro"
          payments={history.payments || []}
          canVoid={canVoid}
          onVoid={async (paymentId, reason) => { await voidReceipt(paymentId, reason); await load(); }}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}
