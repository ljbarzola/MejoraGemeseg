import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getLots } from '../../../services/cacao.service';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function LotsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    getLots(statusFilter ? { status: statusFilter } : undefined)
      .then(setLots)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    const factor = UNIT_FACTORS[unit] || 1;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Lotes</h1>
          </div>
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="OPEN">Abierto</option>
          <option value="CLOSED">Cerrado</option>
        </select>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando lotes...</div>
        ) : lots.length === 0 ? (
          <div className="empty-state">No hay lotes registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Calidad</th>
                  <th>Entrada</th>
                  <th>Peso Neto</th>
                  <th>Costo Promedio</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => {
                  const receptionUnit = l.receptions?.[0]?.unitOfMeasure || null;
                  const origWeight = getOrigWeight(l.netWeight, receptionUnit);
                  return (
                    <tr key={l.id}>
                      <td className="tasks-table-title">{l.code}</td>
                      <td>{l.quality?.name || '—'}</td>
                      <td>
                        {receptionUnit && (
                          <span className="status-badge" style={{
                            backgroundColor: receptionUnit === 'KG' ? '#f0fff4' : '#ebf8ff',
                            color: receptionUnit === 'KG' ? '#276749' : '#2b6cb0',
                            fontSize: '11px',
                          }}>
                            {receptionUnit}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {l.netWeight.toLocaleString()} kg
                        {origWeight && <span style={{ fontSize: '11px', color: '#2b6cb0', marginLeft: '4px' }}>({origWeight.value} {origWeight.abbr})</span>}
                      </td>
                      <td>${l.averageCost.toFixed(2)}</td>
                      <td>${(l.netWeight * l.averageCost).toFixed(2)}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: l.status === 'OPEN' ? '#c6f6d5' : '#fed7d7',
                            color: l.status === 'OPEN' ? '#276749' : '#9b2c2c',
                          }}
                        >
                          {l.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-sm-edit" onClick={() => navigate(`/cacao/lots/${l.id}`)}>Ver</button>
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
