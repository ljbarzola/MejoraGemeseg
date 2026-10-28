import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getReceivables, receiveReceivable, voidReceipt } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoCuenta, apiErrorMessage } from '../utils';
import FormModal from '../../../components/common/FormModal';
import PaymentsHistoryModal from '../PaymentsHistoryModal';
import { useTablaCacao } from '../useTablaCacao';

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

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'cuentas-por-cobrar',
    filas: receivables,
    idFila: (r) => r.id,
    ordenInicial: 'vence',
    principal: { key: 'cliente', ancho: 200, label: 'Cliente', orden: (r) => r.client?.name, celda: (r) => r.client?.name || '—' },
    columnas: [
      { key: 'embarque', ancho: 150, label: 'Embarque', orden: (r) => r.shipment?.contractRef, celda: (r) => r.shipment?.contractRef || '—' },
      { key: 'total', excel: { tipo: 'moneda', titulo: 'Monto Total ($)' }, label: 'Monto Total', orden: (r) => r.totalAmount, celda: (r) => fmt(r.totalAmount) },
      { key: 'cobrado', excel: { tipo: 'moneda', titulo: 'Cobrado ($)' }, label: 'Cobrado', orden: (r) => r.receivedAmount, celda: (r) => fmt(r.receivedAmount) },
      {
        key: 'saldo', excel: { tipo: 'moneda', titulo: 'Saldo ($)' },
        label: 'Saldo',
        orden: (r) => remainingOf(r),
        celda: (r) => <span style={{ fontWeight: 600, color: remainingOf(r) > 0 ? '#38a169' : '#718096' }}>{fmt(remainingOf(r))}</span>,
      },
      { key: 'vence', excel: { tipo: 'fecha' }, ancho: 140, label: 'Fecha Vencimiento', orden: (r) => new Date(r.dueDate).getTime(), celda: (r) => formatDateEc(r.dueDate) },
      {
        key: 'estado', ancho: 120,
        label: 'Estado',
        orden: (r) => estadoCuenta(r.status).label,
        celda: (r) => {
          const estado = estadoCuenta(r.status);
          return <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>;
        },
      },
    ],
    acciones: (r) => (
      <div style={{ display: 'flex', gap: '6px' }}>
        {r.status !== 'RECEIVED' && r.status !== 'CANCELLED' && <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => startReceive(r)}>Cobrar</button>}
        {r.payments?.length > 0 && (
          <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => { setError(''); setHistoryId(r.id); }}>Cobros</button>
        )}
      </div>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader eyebrow="Cacao" title="Cuentas por Cobrar" description="Lo que te deben tus clientes. Cada cuenta nace con un embarque." />

      <div className="filter-bar">
        <div className="filter-bar-fields">{buscador}</div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando cuentas por cobrar...</div>
        ) : receivables.length === 0 ? (
          <div className="empty-state">No hay cuentas por cobrar. Se crean solas cuando registras un embarque.</div>
        ) : (
          tabla
        )}
      </div>

      {editing && (
        <FormModal
          title="Registrar cobro"
          descripcion="Anota lo que te pagó el cliente; el saldo de la cuenta baja de inmediato."
          submitLabel="Registrar cobro"
          saving={saving}
          error={error}
          onClose={() => setEditingId(null)}
          onSubmit={handleReceive}
        >
          <p style={{ margin: 0, color: '#4a5568', fontSize: '13px' }}>
            <strong>{editing.client?.name}</strong> · Saldo pendiente {fmt(remainingOf(editing))}
          </p>
          <div className="form-group">
            <label htmlFor="cobro-monto">Monto ($) *</label>
            <input id="cobro-monto" type="number" inputMode="decimal" step="0.01" min="0" value={receiveForm.amount} onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="cobro-metodo">Método de cobro</label>
            <select id="cobro-metodo" value={receiveForm.method} onChange={(e) => setReceiveForm({ ...receiveForm, method: e.target.value })}>
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CHECK">Cheque</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="cobro-ref">Referencia</label>
            <input id="cobro-ref" type="text" maxLength={120} autoComplete="off" value={receiveForm.reference} onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })} placeholder="Nro. de comprobante o de transferencia" />
          </div>
        </FormModal>
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
