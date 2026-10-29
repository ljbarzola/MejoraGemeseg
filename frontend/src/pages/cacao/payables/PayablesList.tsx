import { useState, useEffect } from 'react';
import { ListChecks, Wallet } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
import PageTabs, { type PageTab } from '../../../components/common/PageTabs';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getPayables, payPayable, voidPayment, getCacaoConfig, createPaymentRequest } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoCuenta, apiErrorMessage } from '../utils';
import FormModal from '../../../components/common/FormModal';
import PaymentsHistoryModal from '../PaymentsHistoryModal';
import PaymentRequestsPanel from './PaymentRequestsPanel';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { useTablaCacao } from '../useTablaCacao';

type Pestana = 'cuentas' | 'solicitudes';

const PESTANAS: PageTab<Pestana>[] = [
  { key: 'cuentas', label: 'Cuentas', icon: Wallet, title: 'Lo que debes a cada proveedor' },
  { key: 'solicitudes', label: 'Solicitudes de pago', icon: ListChecks, title: 'Pagos pedidos, por autorizar y autorizados' },
];

/** La pantalla espera a saber si la empresa exige autorización antes de armar sus columnas. */
export default function PayablesList() {
  const [exige, setExige] = useState<boolean | null>(null);
  useEffect(() => {
    getCacaoConfig().then((c) => setExige(!!c.pagosRequierenAutorizacion)).catch(() => setExige(false));
  }, []);
  if (exige === null) return <div className="page-container"><div className="loading-state">Cargando cuentas por pagar...</div></div>;
  return <PayablesView exigeAutorizacion={exige} />;
}

function PayablesView({ exigeAutorizacion }: { exigeAutorizacion: boolean }) {
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'TRANSFER', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const rol = getUser()?.role;
  const canVoid = rol === 'ADMIN';
  // Si la empresa exige autorización, «Pagar» pasa a ser «Solicitar pago» y aparece la pestaña de solicitudes.
  const [pestana, setPestana] = useState<Pestana>('cuentas');
  const [versionSolicitudes, setVersionSolicitudes] = useState(0);
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    return getPayables().then(setPayables).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const editing = payables.find((p) => p.id === editingId);
  const remainingOf = (p: any) => Math.round((p.totalAmount - p.paidAmount) * 100) / 100;
  // Con autorización, lo ya pedido o autorizado (y aún sin pagar) no se puede volver a pedir.
  const comprometidoDe = (p: any) => Math.round((p.requests || []).reduce((t: number, r: any) => t + r.amount, 0) * 100) / 100;
  const disponibleDe = (p: any) => Math.max(0, Math.round((remainingOf(p) - (exigeAutorizacion ? comprometidoDe(p) : 0)) * 100) / 100);

  function startPay(p: any) {
    // Pedir un pago lo hacen el administrador y el gerente; el resto recibe la explicación.
    if (exigeAutorizacion && rol !== 'ADMIN' && rol !== 'MANAGER') { setSoloAdmin('solicite el pago'); return; }
    setError('');
    setEditingId(p.id);
    setPayForm({ amount: disponibleDe(p).toFixed(2), method: 'TRANSFER', reference: '' });
  }

  async function handlePay() {
    if (!editing) return;
    const amount = Number(payForm.amount);
    if (!payForm.amount || !(amount > 0)) { setError('El monto debe ser mayor a cero'); return; }
    if (amount > disponibleDe(editing) + 0.005) {
      setError(exigeAutorizacion
        ? `El monto no puede superar lo que falta por pagar sin solicitud ($${disponibleDe(editing).toFixed(2)})`
        : `El monto no puede superar el saldo pendiente ($${remainingOf(editing).toFixed(2)})`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const datos = { amount, method: payForm.method, reference: payForm.reference.trim() || undefined };
      if (exigeAutorizacion) {
        await createPaymentRequest(editing.id, datos);
        setVersionSolicitudes((v) => v + 1);
        setPestana('solicitudes');
      } else {
        await payPayable(editing.id, datos);
      }
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, exigeAutorizacion
        ? 'No se pudo solicitar el pago. Revisa los datos e inténtalo de nuevo.'
        : 'No se pudo registrar el pago. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const history = payables.find((p) => p.id === historyId);

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'cuentas-por-pagar',
    filas: payables,
    idFila: (p) => p.id,
    ordenInicial: 'vence',
    principal: { key: 'proveedor', filtro: { tipo: 'valores', vacio: 'Sin proveedor', getValues: (p) => (p.supplier?.name ? { valor: String(p.supplier.id ?? p.supplier.name), etiqueta: p.supplier.name } : null) }, ancho: 200, label: 'Proveedor', orden: (p) => p.supplier?.name, celda: (p) => p.supplier?.name || '—' },
    columnas: [
      {
        key: 'liquidacion', filtro: { tipo: 'texto', getValue: (p) => (p.settlement?.id ? `LIQ-${String(p.settlement.id).padStart(4, '0')}` : '') }, excel: { valor: (p) => (p.settlement?.id ? `LIQ-${String(p.settlement.id).padStart(4, '0')}` : '') }, ancho: 120,
        label: 'Liquidación',
        orden: (p) => p.settlement?.id,
        celda: (p) => (p.settlement?.id ? `LIQ-${String(p.settlement.id).padStart(4, '0')}` : '—'),
      },
      { key: 'total', filtro: { tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => p.totalAmount }, excel: { tipo: 'moneda', titulo: 'Monto Total ($)' }, label: 'Monto Total', orden: (p) => p.totalAmount, celda: (p) => fmt(p.totalAmount) },
      { key: 'pagado', filtro: { tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => p.paidAmount }, excel: { tipo: 'moneda', titulo: 'Pagado ($)' }, label: 'Pagado', orden: (p) => p.paidAmount, celda: (p) => fmt(p.paidAmount) },
      {
        key: 'saldo', filtro: { tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => (p.status === 'CANCELLED' ? null : remainingOf(p)) }, excel: { tipo: 'moneda', titulo: 'Saldo ($)' },
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
      {
        key: 'tramite', filtro: { tipo: 'numero', formato: (n) => fmt(n), getValue: (p) => comprometidoDe(p) }, excel: { tipo: 'moneda', titulo: 'En trámite ($)', valor: (p) => comprometidoDe(p) }, ancho: 130, label: 'En trámite',
        ocultaPorDefecto: !exigeAutorizacion,
        orden: (p) => comprometidoDe(p),
        celda: (p) => (comprometidoDe(p) > 0
          ? <span title="Pedido o autorizado, todavía sin pagar" style={{ color: '#2b6cb0', fontWeight: 600 }}>{fmt(comprometidoDe(p))}</span>
          : '—'),
      },
      { key: 'vence', filtro: { tipo: 'fecha', soloDia: true, getValue: (p) => p.dueDate }, excel: { tipo: 'fecha' }, ancho: 140, label: 'Fecha Vencimiento', orden: (p) => new Date(p.dueDate).getTime(), celda: (p) => formatDateEc(p.dueDate) },
      {
        key: 'estado', filtro: { tipo: 'valores', getValues: (p) => ({ valor: p.status, etiqueta: estadoCuenta(p.status).label }) }, ancho: 120,
        label: 'Estado',
        orden: (p) => estadoCuenta(p.status).label,
        celda: (p) => {
          const estado = estadoCuenta(p.status);
          return <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>;
        },
      },
    ],
    acciones: (p) => {
      const puedePagar = (p.status === 'PENDING' || p.status === 'PARTIAL') && p.settlement?.status === 'APPROVED'
        && (!exigeAutorizacion || disponibleDe(p) > 0);
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {puedePagar && <button className="btn-sm-edit btn-sm-edit--texto" title={exigeAutorizacion ? 'Solicitar el pago' : undefined} onClick={() => startPay(p)}>{exigeAutorizacion ? 'Solicitar' : 'Pagar'}</button>}
          {p.payments?.length > 0 && (
            <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => { setError(''); setHistoryId(p.id); }}>Pagos</button>
          )}
        </div>
      );
    },
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Cuentas por Pagar"
        description={exigeAutorizacion
          ? 'Lo que debes a tus proveedores. Cada cuenta nace al aprobar una liquidación; para pagarla se solicita el pago, otra persona lo autoriza y el administrador lo registra.'
          : 'Lo que debes a tus proveedores. Cada cuenta nace cuando se aprueba una liquidación.'}
      />

      {exigeAutorizacion && (
        <PageTabs tabs={PESTANAS} value={pestana} onChange={setPestana} label="Cuentas por pagar y solicitudes de pago" />
      )}

      {exigeAutorizacion && pestana === 'solicitudes' ? (
        <PaymentRequestsPanel version={versionSolicitudes} recargar={load} />
      ) : (
        <>
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
              <div className="loading-state">Cargando cuentas por pagar...</div>
            ) : payables.length === 0 ? (
              <div className="empty-state">No hay cuentas por pagar. Se generan cuando se aprueba una liquidación.</div>
            ) : (
              tabla
            )}
          </div>
        </>
      )}

      {editing && (
        <FormModal
          title={exigeAutorizacion ? 'Solicitar pago' : 'Registrar pago'}
          descripcion={exigeAutorizacion
            ? 'Tu empresa exige autorización: el pago no se registra todavía. Otra persona debe autorizarlo y luego el administrador lo paga.'
            : 'Anota lo que le pagaste al proveedor; el saldo de la cuenta baja de inmediato.'}
          submitLabel={exigeAutorizacion ? 'Solicitar pago' : 'Registrar pago'}
          saving={saving}
          error={error}
          onClose={() => setEditingId(null)}
          onSubmit={handlePay}
        >
          <p style={{ margin: 0, color: '#4a5568', fontSize: '13px' }}>
            <strong>{editing.supplier?.name}</strong> · Saldo pendiente {fmt(remainingOf(editing))}
            {exigeAutorizacion && comprometidoDe(editing) > 0 && <> · Ya en trámite {fmt(comprometidoDe(editing))} · Se puede pedir {fmt(disponibleDe(editing))}</>}
          </p>
          <div className="form-group">
            <label htmlFor="pago-monto">Monto ($) *</label>
            <input id="pago-monto" type="number" inputMode="decimal" step="0.01" min="0" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pago-metodo">Método de pago</label>
            <select id="pago-metodo" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CHECK">Cheque</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pago-ref">Referencia</label>
            <input id="pago-ref" type="text" maxLength={120} autoComplete="off" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Nro. de comprobante o de transferencia" />
          </div>
        </FormModal>
      )}

      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}

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
