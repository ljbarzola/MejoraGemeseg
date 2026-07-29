import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSettlements } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function SettlementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [settlement, setSettlement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettlements().then((data: any[]) => {
      const found = data.find((s: any) => s.id === Number(id));
      setSettlement(found || null);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-state">Cargando liquidación...</div>;
  if (!settlement) return <div className="empty-state">Liquidación no encontrada.</div>;

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao/settlements')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Liquidación LIQ-{String(settlement.id).padStart(4, '0')}</h1>
          </div>
        </div>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          🖨️ Descargar PDF
        </button>
      </div>

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div className="form-row" style={{ gap: '32px', flexWrap: 'wrap' }}>
          <div><strong>ID:</strong> LIQ-{String(settlement.id).padStart(4, '0')}</div>
          <div><strong>Fecha:</strong> {formatDateEc(settlement.date)}</div>
          <div><strong>Proveedor:</strong> {settlement.supplier?.name || '—'}</div>
          <div>
            <strong>Estado:</strong>{' '}
            <span className="status-badge" style={{ backgroundColor: settlement.status === 'PAID' ? '#c6f6d5' : '#fefcbf', color: settlement.status === 'PAID' ? '#276749' : '#975a16' }}>
              {settlement.status === 'PAID' ? 'Pagada' : 'Pendiente'}
            </span>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '32px', fontSize: '14px', flexWrap: 'wrap' }}>
          <div><strong>Periodo:</strong> {formatDateEc(settlement.periodStart)} — {formatDateEc(settlement.periodEnd)}</div>
          <div><strong>Peso Neto Total:</strong> {settlement.totalNetWeight.toLocaleString()} kg</div>
          <div><strong>Deducciones:</strong> {fmt(settlement.totalDeductions)}</div>
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
                    <td>{fmt(sl.unitCost)}/kg</td>
                    <td style={{ fontWeight: 700, color: '#276749' }}>{fmt(sl.quantity * sl.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settlement.payable && (
        <div className="page-card" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '14px', display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div><strong>CxP Asociada:</strong> PAGO-{String(settlement.payable.id).padStart(4, '0')}</div>
            <div><strong>Monto:</strong> {fmt(settlement.payable.totalAmount)}</div>
            <div><strong>Pagado:</strong> {fmt(settlement.payable.paidAmount)}</div>
            <div><strong>Vence:</strong> {formatDateEc(settlement.payable.dueDate)}</div>
            <div>
              <span className="status-badge" style={{ backgroundColor: settlement.payable.status === 'PAID' ? '#c6f6d5' : '#fed7d7', color: settlement.payable.status === 'PAID' ? '#276749' : '#9b2c2c' }}>
                {settlement.payable.status === 'PAID' ? 'Pagada' : settlement.payable.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
