import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getShipments } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function ShipmentsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShipments().then(setShipments).finally(() => setLoading(false));
  }, []);

  function getDisplayStatus(s: any) {
    if (s.receivable?.status === 'RECEIVED') return { label: 'Cobrado', bg: '#c6f6d5', color: '#276749' };
    if (s.receivable?.status === 'PARTIAL') return { label: 'Parcial', bg: '#fefcbf', color: '#975a16' };
    if (s.status === 'COMPLETED') return { label: 'Completado', bg: '#c6f6d5', color: '#276749' };
    return { label: 'Pendiente', bg: '#fefcbf', color: '#975a16' };
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Embarques</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/cacao/shipments/new')}>+ Nuevo Embarque</button>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando embarques...</div>
        ) : shipments.length === 0 ? (
          <div className="empty-state">No hay embarques registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Referencia</th>
                  <th>Peso Total</th>
                  <th>Costo Total</th>
                  <th>Precio Venta</th>
                  <th>Margen</th>
                  <th>Estado</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const st = getDisplayStatus(s);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2f855a' }}>EMB-{String(s.id).padStart(4, '0')}</td>
                      <td>{formatDateEc(s.date)}</td>
                      <td>{s.client?.name || '—'}</td>
                      <td>{s.contractRef}</td>
                      <td>{s.totalWeight.toLocaleString()} kg</td>
                      <td>${s.totalCost.toFixed(2)}</td>
                      <td>${s.salePrice.toFixed(2)}/kg</td>
                      <td style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td className="no-print">
                        <button className="btn-sm-edit" onClick={() => navigate(`/cacao/shipments/${s.id}`, { state: { from: '/cacao/shipments' } })}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
