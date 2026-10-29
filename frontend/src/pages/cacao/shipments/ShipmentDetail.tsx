import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getShipments, cancelShipment } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import { useCompany } from '../../../contexts/ThemeContext';
import { ABREVIATURA_UNIDAD as UNIT_ABBR } from '../useCacaoUnidades';
import { getUser } from '../../../services/auth.service';
import MotivoDialog from '../MotivoDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';


export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useCompany();
  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');
  // Quien no es administrador ve el botón igual y, al usarlo, se le explica a quién acudir (no se esconde).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const esAdmin = getUser()?.role === 'ADMIN';

  const cargar = () => getShipments().then((data: any[]) => {
    const found = data.find((s: any) => s.id === Number(id));
    setShipment(found || null);
  }).finally(() => setLoading(false));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [id]);

  async function anular(reason: string) {
    setAnulando(false);
    setError('');
    try {
      await cancelShipment(shipment.id, reason);
      await cargar();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo anular el embarque.'));
    }
  }

  useEffect(() => {
    if (shipment) document.title = `EMB-${String(shipment.id).padStart(4, '0')} — ${theme.name}`;
    return () => { document.title = 'GEMESEG Mejora'; };
  }, [shipment, theme.name]);

  if (loading) return <div className="loading-state">Cargando embarque...</div>;
  if (!shipment) return <div className="empty-state">Embarque no encontrado.</div>;

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unitAbbr = UNIT_ABBR[shipment.unitOfMeasure] || 'kg';
  const anulado = shipment.status === 'CANCELLED';
  const estado = anulado
    ? { label: 'Anulado', bg: '#fed7d7', color: '#9b2c2c' }
    : shipment.status === 'COMPLETED'
      ? { label: 'Completado', bg: '#c6f6d5', color: '#276749' }
      : { label: 'Pendiente', bg: '#fefcbf', color: '#975a16' };

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
          <div style={{ fontSize: '10px', color: '#718096' }}>Embarque EMB-{String(shipment.id).padStart(4, '0')}</div>
        </div>
      </div>

      <div className="page-header-row no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao/shipments')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Embarque EMB-{String(shipment.id).padStart(4, '0')}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!anulado && (
            <button className="btn-secondary" style={{ color: '#c53030' }} onClick={() => (esAdmin ? setAnulando(true) : setSoloAdmin('anule embarques'))}>
              Anular embarque
            </button>
          )}
          <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          🖨️ Descargar PDF
          </button>
        </div>
      </div>

      <ErrorBanner mensaje={error} />
      {anulado && (
        <div className="auth-error-banner no-print" style={{ marginBottom: 16 }}>
          <strong>Embarque anulado</strong>{shipment.cancelledAt ? ` el ${formatDateEc(shipment.cancelledAt)}` : ''}: {shipment.cancelReason || 'sin motivo'}. Los kilos volvieron a sus lotes y la cuenta por cobrar quedó anulada.
        </div>
      )}

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 32px' }}>
          <div><strong>ID:</strong> EMB-{String(shipment.id).padStart(4, '0')}</div>
          <div><strong>Fecha:</strong> {formatDateEc(shipment.date)}</div>
          <div><strong>Cliente:</strong> {shipment.client?.name || '—'}</div>
          <div><strong>Referencia:</strong> {shipment.contractRef}</div>
          <div>
            <strong>Estado:</strong>{' '}
            <span className="status-badge" style={{ backgroundColor: estado.bg, color: estado.color }}>
              {estado.label}
            </span>
          </div>
        </div>
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 32px', fontSize: '14px' }}>
          <div><strong>Peso Total:</strong> {shipment.totalWeight.toLocaleString()} {unitAbbr} ({shipment.totalWeightKg?.toLocaleString() || '—'} kg)</div>
          <div><strong>Costo Total:</strong> {fmt(shipment.totalCost)}</div>
          <div><strong>Precio Venta:</strong> {fmt(shipment.salePrice)}/kg</div>
          <div><strong>Margen:</strong> <span style={{ color: shipment.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{shipment.margin}%</span></div>
        </div>
      </div>

      <div className="admin-section">
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Lotes Incluidos</h2>
        {!shipment.lots?.length ? (
          <div className="empty-state">No hay lotes en este embarque.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Calidad</th>
                  <th>Cantidad ({unitAbbr})</th>
                  <th>Cantidad (kg)</th>
                  <th>Costo Unit.</th>
                  <th>Monto Venta</th>
                </tr>
              </thead>
              <tbody>
                {shipment.lots.map((sl: any) => (
                  <tr key={sl.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sl.lot?.code || '—'}</td>
                    <td>{sl.lot?.quality?.name || '—'}</td>
                    <td>{sl.quantity.toLocaleString()} {unitAbbr}</td>
                    <td>{sl.quantityKg?.toLocaleString() || '—'} kg</td>
                    <td>{fmt(sl.unitCost)}/kg</td>
                    <td style={{ fontWeight: 700, color: '#276749' }}>{fmt(sl.saleAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {shipment.receivable && (
        <div className="page-card" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px 32px', alignItems: 'center' }}>
            <div><strong>CxC Asociada:</strong> COB-{String(shipment.receivable.id).padStart(4, '0')}</div>
            <div><strong>Monto:</strong> {fmt(shipment.receivable.totalAmount)}</div>
            <div><strong>Cobrado:</strong> {fmt(shipment.receivable.receivedAmount)}</div>
            <div><strong>Vence:</strong> {formatDateEc(shipment.receivable.dueDate)}</div>
            <div>
              <span className="status-badge" style={{ backgroundColor: shipment.receivable.status === 'RECEIVED' ? '#c6f6d5' : '#fed7d7', color: shipment.receivable.status === 'RECEIVED' ? '#276749' : '#9b2c2c' }}>
                {shipment.receivable.status === 'RECEIVED' ? 'Cobrada' : shipment.receivable.status === 'CANCELLED' ? 'Anulada' : shipment.receivable.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>
      )}
      {anulando && (
        <MotivoDialog
          tipo="ANULACION"
          title="Anular embarque"
          message="Los kilos vuelven a sus lotes y la cuenta por cobrar se anula. Si ya hay cobros registrados, primero hay que anularlos."
          confirmLabel="Anular embarque"
          onCancel={() => setAnulando(false)}
          onConfirm={anular}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
