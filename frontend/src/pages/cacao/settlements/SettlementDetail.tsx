import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSettlement, approveSettlement, rejectSettlement, cancelSettlement } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, estadoLiquidacion, estadoCuenta, apiErrorMessage } from '../utils';
import { useCompany } from '../../../contexts/ThemeContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import PromptDialog from '../../../components/common/PromptDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';

type Accion = 'approve' | 'reject' | 'cancel' | null;

export default function SettlementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useCompany();
  const me = getUser();
  const [settlement, setSettlement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState<Accion>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSettlement(Number(id))
      .then(setSettlement)
      .catch(() => setSettlement(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (settlement) document.title = `LIQ-${String(settlement.id).padStart(4, '0')} — ${theme.name}`;
    return () => { document.title = 'GEMESEG Mejora'; };
  }, [settlement, theme.name]);

  if (loading) return <div className="loading-state">Cargando liquidación...</div>;
  if (!settlement) return <div className="empty-state">Liquidación no encontrada.</div>;

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const estado = estadoLiquidacion(settlement.status);
  const code = `LIQ-${String(settlement.id).padStart(4, '0')}`;

  // Aprueban/rechazan/anulan el gerente o el administrador; quien creó la liquidación no puede aprobarla.
  const puedeDecidir = me?.role === 'ADMIN' || me?.role === 'MANAGER';
  const esQuienLaCreo = me?.id === settlement.createdBy;
  const puedeAnular = settlement.status === 'APPROVED' && !(settlement.payable?.paidAmount > 0);

  async function ejecutar(fn: () => Promise<any>, falla: string) {
    setBusy(true);
    setError('');
    try {
      setSettlement(await fn());
    } catch (err: any) {
      setError(apiErrorMessage(err, falla));
    } finally {
      setBusy(false);
      setAccion(null);
    }
  }

  return (
    <div className="page-container">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-container { padding: 8px !important; font-size: 12px !important; }
          .page-card, .admin-section { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 8px 0 !important; }
          .page-card { max-width: 100% !important; }
          .print-header { display: flex !important; }
          body { background: white !important; }
          .tasks-table { font-size: 11px !important; }
          .tasks-table th, .tasks-table td { padding: 4px 6px !important; }
        }
        .print-header { display: none; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 2px solid #1a202c; margin-bottom: 12px; }
      `}</style>

      <div className="print-header">
        {theme.logoUrl && <img src={theme.logoUrl} alt={theme.name} style={{ height: '40px' }} />}
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1a202c' }}>{theme.name}</div>
          <div style={{ fontSize: '10px', color: '#718096' }}>Liquidación {code}</div>
        </div>
      </div>

      <div className="page-header-row no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao/settlements')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Liquidación {code}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {settlement.status === 'PENDING' && puedeDecidir && (
            <>
              <button className="btn-secondary" onClick={() => setAccion('reject')} disabled={busy}>Rechazar</button>
              <button className="auth-btn" onClick={() => setAccion('approve')} disabled={busy || esQuienLaCreo} title={esQuienLaCreo ? 'La debe aprobar otra persona, no quien la creó' : undefined}>Aprobar</button>
            </>
          )}
          {puedeAnular && puedeDecidir && (
            <button className="btn-secondary" style={{ color: '#c53030' }} onClick={() => setAccion('cancel')} disabled={busy}>Anular liquidación</button>
          )}
          <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            🖨️ Descargar PDF
          </button>
        </div>
      </div>

      <div className="no-print"><ErrorBanner mensaje={error} /></div>

      {settlement.status === 'PENDING' && (
        <div className="no-print" style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #f6e05e', borderRadius: '8px', fontSize: '13px', color: '#975a16', marginBottom: '16px' }}>
          Esta liquidación está por aprobar. La cuenta por pagar se genera cuando un gerente la apruebe
          {esQuienLaCreo && puedeDecidir ? '; como la creaste tú, debe aprobarla otra persona.' : '.'}
        </div>
      )}
      {(settlement.status === 'REJECTED' || settlement.status === 'CANCELLED') && settlement.decisionReason && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', fontSize: '13px', color: '#9b2c2c', marginBottom: '16px' }}>
          <strong>{settlement.status === 'REJECTED' ? 'Motivo del rechazo:' : 'Motivo de la anulación:'}</strong> {settlement.decisionReason}
        </div>
      )}

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 32px' }}>
          <div><strong>ID:</strong> {code}</div>
          <div><strong>Fecha:</strong> {formatDateEc(settlement.date)}</div>
          <div><strong>Proveedor:</strong> {settlement.supplier?.name || '—'}</div>
          <div>
            <strong>Estado:</strong>{' '}
            <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>{estado.label}</span>
          </div>
        </div>
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 32px', fontSize: '14px' }}>
          <div><strong>Periodo:</strong> {formatDateEc(settlement.periodStart)} — {formatDateEc(settlement.periodEnd)}</div>
          <div><strong>Peso Neto Total:</strong> {settlement.totalNetWeight.toLocaleString()} kg</div>
          <div><strong>Descuentos:</strong> {settlement.totalDeductions.toLocaleString()} kg</div>
          <div><strong>Monto Total:</strong> <span style={{ color: '#276749', fontWeight: 700 }}>{fmt(settlement.totalAmount)}</span></div>
        </div>
      </div>

      <div className="admin-section">
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Lotes Incluidos</h2>
        {!settlement.lots?.length ? (
          <div className="empty-state">No hay lotes en esta liquidación.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Calidad</th>
                  <th>Cantidad (kg)</th>
                  <th>Humedad %</th>
                  <th>Impurezas %</th>
                  <th>Castigo $/kg</th>
                  <th>Peso Neto (kg)</th>
                  <th>Costo Unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {settlement.lots.map((sl: any) => (
                  <tr key={sl.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sl.lot?.code || '—'}</td>
                    <td>{sl.lot?.quality?.name || '—'}</td>
                    <td>{sl.quantity.toLocaleString()} kg</td>
                    <td>{sl.humidityPct ?? '—'}</td>
                    <td>{sl.impurityPct ?? '—'}</td>
                    <td>{sl.qualityPunishment ? fmt(sl.qualityPunishment) : '—'}</td>
                    <td>{sl.netKg != null ? sl.netKg.toLocaleString() : '—'}</td>
                    <td>{fmt(sl.unitCost)}/kg</td>
                    <td style={{ fontWeight: 700, color: '#276749' }}>{fmt(sl.amount ?? sl.quantity * sl.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settlement.payable && (
        <div className="page-card" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px 32px', alignItems: 'center' }}>
            <div><strong>CxP Asociada:</strong> PAGO-{String(settlement.payable.id).padStart(4, '0')}</div>
            <div><strong>Monto:</strong> {fmt(settlement.payable.totalAmount)}</div>
            <div><strong>Pagado:</strong> {fmt(settlement.payable.paidAmount)}</div>
            <div><strong>Vence:</strong> {formatDateEc(settlement.payable.dueDate)}</div>
            <div>
              <span className="status-badge" style={{ backgroundColor: estadoCuenta(settlement.payable.status).bg, color: estadoCuenta(settlement.payable.status).color }}>
                {estadoCuenta(settlement.payable.status).label}
              </span>
            </div>
          </div>
        </div>
      )}

      {accion === 'approve' && (
        <ConfirmDialog
          title="Aprobar liquidación"
          message={`Vas a aprobar ${code} por ${fmt(settlement.totalAmount)}. Se generará la cuenta por pagar y ya se podrá pagar.`}
          confirmLabel="Aprobar"
          onCancel={() => setAccion(null)}
          onConfirm={() => ejecutar(() => approveSettlement(settlement.id), 'No se pudo aprobar la liquidación.')}
        />
      )}
      {accion === 'reject' && (
        <PromptDialog
          title="Rechazar liquidación"
          message="Indica el motivo del rechazo. Los lotes quedarán libres para liquidarse otra vez."
          confirmLabel="Rechazar"
          required
          onCancel={() => setAccion(null)}
          onConfirm={(reason) => ejecutar(() => rejectSettlement(settlement.id, reason), 'No se pudo rechazar la liquidación.')}
        />
      )}
      {accion === 'cancel' && (
        <PromptDialog
          title="Anular liquidación"
          message="Indica el motivo de la anulación. Se anula también la cuenta por pagar y los lotes quedan libres."
          confirmLabel="Anular"
          required
          onCancel={() => setAccion(null)}
          onConfirm={(reason) => ejecutar(() => cancelSettlement(settlement.id, reason), 'No se pudo anular la liquidación.')}
        />
      )}
    </div>
  );
}
