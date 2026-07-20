import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettlements } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function SettlementsList() {
  const navigate = useNavigate();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettlements().then(setSettlements).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Liquidaciones</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/cacao/settlements/new')}>+ Nueva Liquidación</button>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando liquidaciones...</div>
        ) : settlements.length === 0 ? (
          <div className="empty-state">No hay liquidaciones registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Periodo</th>
                  <th>Peso Neto Total</th>
                  <th>Deducciones</th>
                  <th>Precio Final</th>
                  <th>Monto Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateEc(s.date)}</td>
                    <td>{s.supplier?.name || '—'}</td>
                    <td>{formatDateEc(s.periodStart)} - {formatDateEc(s.periodEnd)}</td>
                    <td>{s.totalNetWeight.toLocaleString()} kg</td>
                    <td>${s.totalDeductions.toFixed(2)}</td>
                    <td>${s.finalPrice.toFixed(2)}/kg</td>
                    <td>${s.totalAmount.toFixed(2)}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: s.status === 'PAID' ? '#c6f6d5' : '#fefcbf', color: s.status === 'PAID' ? '#276749' : '#975a16' }}>
                        {s.status === 'PAID' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
