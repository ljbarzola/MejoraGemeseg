import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getShipments } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function ShipmentsList() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShipments().then(setShipments).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
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
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Referencia</th>
                  <th>Peso Total</th>
                  <th>Costo Total</th>
                  <th>Precio Venta</th>
                  <th>Margen</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateEc(s.date)}</td>
                    <td>{s.client?.name || '—'}</td>
                    <td>{s.contractRef}</td>
                    <td>{s.totalWeight.toLocaleString()} kg</td>
                    <td>${s.totalCost.toFixed(2)}</td>
                    <td>${s.salePrice.toFixed(2)}/kg</td>
                    <td style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: s.status === 'PENDING' ? '#fefcbf' : '#c6f6d5', color: s.status === 'PENDING' ? '#975a16' : '#276749' }}>
                        {s.status === 'PENDING' ? 'Pendiente' : 'Completado'}
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
