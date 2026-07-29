import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getShipments } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShipments().then((data: any[]) => {
      const found = data.find((s: any) => s.id === Number(id));
      setShipment(found || null);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-state">Cargando embarque...</div>;
  if (!shipment) return <div className="empty-state">Embarque no encontrado.</div>;

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unitAbbr = UNIT_ABBR[shipment.unitOfMeasure] || 'kg';

  return (
    <div className="page-container">
      <style>{`
        @media print {
          .page-header-row, .cacao-back-btn, .no-print { display: none !important; }
          .page-container { padding: 0 !important; }
          .page-card, .admin-section { box-shadow: none !important; border: 1px solid #ccc !important; }
          .page-card { max-width: 100% !important; }
        }
      `}</style>
      <div className="page-header-row no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao/shipments')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Embarque EMB-{String(shipment.id).padStart(4, '0')}</h1>
          </div>
        </div>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          🖨️ Descargar PDF
        </button>
      </div>

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div className="form-row" style={{ gap: '32px', flexWrap: 'wrap' }}>
          <div><strong>ID:</strong> EMB-{String(shipment.id).padStart(4, '0')}</div>
          <div><strong>Fecha:</strong> {formatDateEc(shipment.date)}</div>
          <div><strong>Cliente:</strong> {shipment.client?.name || '—'}</div>
          <div><strong>Referencia:</strong> {shipment.contractRef}</div>
          <div>
            <strong>Estado:</strong>{' '}
            <span className="status-badge" style={{ backgroundColor: shipment.status === 'COMPLETED' ? '#c6f6d5' : '#fefcbf', color: shipment.status === 'COMPLETED' ? '#276749' : '#975a16' }}>
              {shipment.status === 'COMPLETED' ? 'Completado' : 'Pendiente'}
            </span>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '32px', fontSize: '14px', flexWrap: 'wrap' }}>
          <div><strong>Peso Total:</strong> {shipment.totalWeight.toLocaleString()} {unitAbbr} ({shipment.totalWeightKg?.toLocaleString() || '—'} kg)</div>
          <div><strong>Costo Total:</strong> {fmt(shipment.totalCost)}</div>
          <div><strong>Precio Venta:</strong> {fmt(shipment.salePrice)}/{unitAbbr}</div>
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
          <div style={{ fontSize: '14px', display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div><strong>CxC Asociada:</strong> COB-{String(shipment.receivable.id).padStart(4, '0')}</div>
            <div><strong>Monto:</strong> {fmt(shipment.receivable.totalAmount)}</div>
            <div><strong>Cobrado:</strong> {fmt(shipment.receivable.receivedAmount)}</div>
            <div><strong>Vence:</strong> {formatDateEc(shipment.receivable.dueDate)}</div>
            <div>
              <span className="status-badge" style={{ backgroundColor: shipment.receivable.status === 'RECEIVED' ? '#c6f6d5' : '#fed7d7', color: shipment.receivable.status === 'RECEIVED' ? '#276749' : '#9b2c2c' }}>
                {shipment.receivable.status === 'RECEIVED' ? 'Cobrada' : shipment.receivable.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
