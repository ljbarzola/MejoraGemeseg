import { useState, useEffect } from 'react';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import {
  getPaymentRequests, authorizePaymentRequest, rejectPaymentRequest, cancelPaymentRequest, payPaymentRequest,
} from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, apiErrorMessage, PAYMENT_METHOD_LABEL } from '../utils';
import { useTablaCacao } from '../useTablaCacao';
import MotivoDialog from '../MotivoDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import RowActionsMenu from '../../../components/common/RowActionsMenu';

const ESTADO: Record<string, { label: string; bg: string; color: string; orden: number }> = {
  REQUESTED: { label: 'Por autorizar', bg: '#fefcbf', color: '#975a16', orden: 0 },
  AUTHORIZED: { label: 'Autorizada', bg: '#bee3f8', color: '#2b6cb0', orden: 1 },
  PAID: { label: 'Pagada', bg: '#c6f6d5', color: '#276749', orden: 2 },
  REJECTED: { label: 'Rechazada', bg: '#fed7d7', color: '#9b2c2c', orden: 3 },
  CANCELLED: { label: 'Cancelada', bg: '#e2e8f0', color: '#4a5568', orden: 4 },
};

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaHora = (iso?: string | null) => (iso ? formatDateEc(iso) : '');

type Accion =
  | { tipo: 'autorizar' | 'pagar' | 'cancelar'; solicitud: any }
  | { tipo: 'rechazar'; solicitud: any };

/**
 * Solicitudes de pago a proveedores (solo cuando la empresa exige autorización): alguien pide el pago,
 * otra persona lo autoriza y el administrador lo paga. Cada paso queda con quién y cuándo.
 * `recargar` avisa a la pantalla de cuentas para que actualice saldos cuando algo se paga.
 */
export default function PaymentRequestsPanel({ recargar, version }: { recargar: () => void; version: number }) {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<string>('ABIERTAS');
  const [accion, setAccion] = useState<Accion | null>(null);
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);

  const usuario = getUser();
  const puedeDecidir = usuario?.role === 'ADMIN' || usuario?.role === 'MANAGER';
  const esAdmin = usuario?.role === 'ADMIN';

  const load = () => getPaymentRequests().then(setSolicitudes).finally(() => setLoading(false));
  useEffect(() => { load(); }, [version]);

  async function ejecutar(fn: () => Promise<unknown>, fallback: string) {
    setError('');
    try {
      await fn();
      await load();
      recargar();
    } catch (err: any) {
      setError(apiErrorMessage(err, fallback));
    }
  }

  const visibles = solicitudes.filter((s) => {
    if (filtro === 'TODAS') return true;
    if (filtro === 'ABIERTAS') return s.status === 'REQUESTED' || s.status === 'AUTHORIZED';
    return s.status === filtro;
  });

  const autorizar = (s: any) => {
    if (!puedeDecidir) { setSoloAdmin('autorice pagos'); return; }
    if (s.requestedBy === usuario?.id) { setError('El pago debe autorizarlo otra persona, no quien lo solicitó.'); return; }
    setAccion({ tipo: 'autorizar', solicitud: s });
  };
  const rechazar = (s: any) => {
    if (!puedeDecidir) { setSoloAdmin('rechace pagos'); return; }
    if (s.requestedBy === usuario?.id) { setError('La solicitud debe rechazarla otra persona; si quieres retirarla, cancélala.'); return; }
    setAccion({ tipo: 'rechazar', solicitud: s });
  };
  const pagar = (s: any) => {
    if (!esAdmin) { setSoloAdmin('registre el pago'); return; }
    setAccion({ tipo: 'pagar', solicitud: s });
  };
  const cancelar = (s: any) => {
    if (s.requestedBy !== usuario?.id && !esAdmin) { setSoloAdmin('cancele la solicitud'); return; }
    setAccion({ tipo: 'cancelar', solicitud: s });
  };

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'solicitudes-de-pago',
    filas: visibles,
    idFila: (s) => s.id,
    ordenInicial: 'fecha',
    direccionInicial: 'desc',
    principal: { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (s) => s.payable?.supplier?.name, celda: (s) => s.payable?.supplier?.name || '—' },
    columnas: [
      { key: 'fecha', excel: { tipo: 'fecha' }, ancho: 110, label: 'Solicitada', orden: (s) => new Date(s.createdAt).getTime(), celda: (s) => formatDateEc(s.createdAt) },
      {
        key: 'liquidacion', ancho: 120, label: 'Liquidación', ocultaPorDefecto: true,
        excel: { valor: (s) => (s.payable?.settlement?.id ? `LIQ-${String(s.payable.settlement.id).padStart(4, '0')}` : '') },
        orden: (s) => s.payable?.settlement?.id,
        celda: (s) => (s.payable?.settlement?.id ? `LIQ-${String(s.payable.settlement.id).padStart(4, '0')}` : '—'),
      },
      { key: 'monto', excel: { tipo: 'moneda', titulo: 'Monto ($)' }, label: 'Monto', orden: (s) => s.amount, celda: (s) => <strong>{fmt(s.amount)}</strong> },
      { key: 'metodo', ancho: 130, label: 'Método', excel: { valor: (s) => PAYMENT_METHOD_LABEL[s.method] || s.method }, orden: (s) => s.method, celda: (s) => PAYMENT_METHOD_LABEL[s.method] || s.method },
      { key: 'referencia', ancho: 130, label: 'Referencia', ocultaPorDefecto: true, orden: (s) => s.reference, celda: (s) => s.reference || '—' },
      { key: 'solicito', ancho: 170, label: 'Solicitó', orden: (s) => s.requestedByName, celda: (s) => s.requestedByName || '—' },
      {
        key: 'decidio', ancho: 190, label: 'Autorizó o rechazó',
        excel: { valor: (s) => (s.decidedByName ? `${s.decidedByName} (${fechaHora(s.decidedAt)})` : '') },
        orden: (s) => s.decidedByName,
        celda: (s) => (s.decidedByName
          ? <span title={s.decisionReason || undefined}>{s.decidedByName} <span style={{ color: '#718096', fontSize: 12 }}>{fechaHora(s.decidedAt)}</span></span>
          : '—'),
      },
      {
        key: 'pago', ancho: 190, label: 'Pagó',
        excel: { valor: (s) => (s.paidByName ? `${s.paidByName} (${fechaHora(s.paidAt)})` : '') },
        orden: (s) => s.paidByName,
        celda: (s) => (s.paidByName ? <span>{s.paidByName} <span style={{ color: '#718096', fontSize: 12 }}>{fechaHora(s.paidAt)}</span></span> : '—'),
      },
      {
        key: 'estado', ancho: 140, label: 'Estado',
        excel: { valor: (s) => ESTADO[s.status]?.label || s.status },
        orden: (s) => ESTADO[s.status]?.orden,
        celda: (s) => {
          const e = ESTADO[s.status] || ESTADO.REQUESTED;
          return <span className="status-badge" style={{ backgroundColor: e.bg, color: e.color }} title={s.decisionReason || undefined}>{e.label}</span>;
        },
      },
    ],
    // El siguiente paso va a la vista; lo demás, detrás de «⋯».
    acciones: (s) => {
      if (s.status === 'REQUESTED') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => autorizar(s)}>Autorizar</button>
            <RowActionsMenu actions={[
              { label: 'Rechazar', danger: true, hint: 'No se paga; queda el motivo', onClick: () => rechazar(s) },
              { label: 'Cancelar solicitud', onClick: () => cancelar(s) },
            ]} />
          </div>
        );
      }
      if (s.status === 'AUTHORIZED') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => pagar(s)}>Pagar</button>
            <RowActionsMenu actions={[{ label: 'Cancelar solicitud', danger: true, hint: 'Se pierde la autorización', onClick: () => cancelar(s) }]} />
          </div>
        );
      }
      return null;
    },
  });

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar-fields">
          {buscador}
          <select className="filter-select" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Estado de la solicitud">
            <option value="ABIERTAS">Por autorizar y autorizadas</option>
            <option value="TODAS">Todas</option>
            {Object.entries(ESTADO).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
          </select>
        </div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={() => { limpiarBusqueda(); setFiltro('ABIERTAS'); }} disabled={!hayBusqueda && filtro === 'ABIERTAS'} />
        </div>
      </div>

      <ErrorBanner mensaje={error} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando solicitudes de pago...</div>
        ) : visibles.length === 0 ? (
          <div className="empty-state">
            {solicitudes.length === 0
              ? 'Todavía no hay solicitudes de pago. Se crean con «Solicitar pago» en una cuenta por pagar.'
              : 'No hay solicitudes con ese estado.'}
          </div>
        ) : (
          tabla
        )}
      </div>

      {accion?.tipo === 'autorizar' && (
        <ConfirmDialog
          title="Autorizar pago"
          message={`¿Autorizar el pago de ${fmt(accion.solicitud.amount)} a ${accion.solicitud.payable?.supplier?.name || 'el proveedor'}? Después, el administrador lo registra como pagado.`}
          confirmLabel="Sí, autorizar"
          onCancel={() => setAccion(null)}
          onConfirm={() => { const s = accion.solicitud; setAccion(null); ejecutar(() => authorizePaymentRequest(s.id), 'No se pudo autorizar el pago.'); }}
        />
      )}
      {accion?.tipo === 'pagar' && (
        <ConfirmDialog
          title="Registrar pago"
          message={`Se registrará el pago de ${fmt(accion.solicitud.amount)} a ${accion.solicitud.payable?.supplier?.name || 'el proveedor'} (${PAYMENT_METHOD_LABEL[accion.solicitud.method] || accion.solicitud.method}${accion.solicitud.reference ? `, ${accion.solicitud.reference}` : ''}) y se descontará de la cuenta por pagar. ¿Continuar?`}
          confirmLabel="Sí, registrar pago"
          onCancel={() => setAccion(null)}
          onConfirm={() => { const s = accion.solicitud; setAccion(null); ejecutar(() => payPaymentRequest(s.id), 'No se pudo registrar el pago.'); }}
        />
      )}
      {accion?.tipo === 'cancelar' && (
        <ConfirmDialog
          title="Cancelar solicitud"
          message={`¿Cancelar la solicitud de ${fmt(accion.solicitud.amount)} a ${accion.solicitud.payable?.supplier?.name || 'el proveedor'}? ${accion.solicitud.status === 'AUTHORIZED' ? 'Se pierde la autorización y ' : ''}El saldo vuelve a quedar libre para pedirlo de nuevo.`}
          confirmLabel="Sí, cancelar"
          danger
          onCancel={() => setAccion(null)}
          onConfirm={() => { const s = accion.solicitud; setAccion(null); ejecutar(() => cancelPaymentRequest(s.id), 'No se pudo cancelar la solicitud.'); }}
        />
      )}
      {accion?.tipo === 'rechazar' && (
        <MotivoDialog
          tipo="PAGO"
          title="Rechazar solicitud de pago"
          message={`Indica por qué no se autoriza el pago de ${fmt(accion.solicitud.amount)} a ${accion.solicitud.payable?.supplier?.name || 'el proveedor'}. Quien lo pidió verá el motivo.`}
          confirmLabel="Rechazar solicitud"
          onCancel={() => setAccion(null)}
          onConfirm={(reason) => { const s = accion.solicitud; setAccion(null); ejecutar(() => rejectPaymentRequest(s.id, reason), 'No se pudo rechazar la solicitud.'); }}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}
