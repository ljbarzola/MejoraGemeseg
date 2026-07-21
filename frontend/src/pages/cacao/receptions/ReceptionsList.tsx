import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getReceptions } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function ReceptionsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [receptions, setReceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReceptions().then(setReceptions).finally(() => setLoading(false));
  }, []);

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
            <h1>Recepciones</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/cacao/receptions/new')}>+ Nueva Recepción</button>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div className="empty-state">No hay recepciones registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Guía</th>
                  <th>Entrada</th>
                  <th>Peso Bruto</th>
                  <th>Tara</th>
                  <th>Peso Neto</th>
                  <th>Humedad %</th>
                  <th>Impurezas %</th>
                  <th>Precio Prov.</th>
                  <th>Lote</th>
                </tr>
              </thead>
              <tbody>
                {receptions.map((r) => {
                  const origGross = getOrigWeight(r.grossWeight, r.unitOfMeasure);
                  const origTare = getOrigWeight(r.tare, r.unitOfMeasure);
                  const origNet = getOrigWeight(r.netWeight, r.unitOfMeasure);
                  return (
                    <tr key={r.id}>
                      <td>{formatDateEc(r.date)}</td>
                      <td>{r.supplier?.name || '—'}</td>
                      <td>{r.guideNumber}</td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: r.unitOfMeasure === 'KG' ? '#f0fff4' : '#ebf8ff',
                          color: r.unitOfMeasure === 'KG' ? '#276749' : '#2b6cb0',
                          fontSize: '11px',
                        }}>
                          {r.unitOfMeasure || 'KG'}
                        </span>
                      </td>
                      <td>
                        {r.grossWeight.toLocaleString()} kg
                        {origGross && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '4px' }}>({origGross.value} {origGross.abbr})</span>}
                      </td>
                      <td>
                        {r.tare.toLocaleString()} kg
                        {origTare && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '4px' }}>({origTare.value} {origTare.abbr})</span>}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {r.netWeight.toLocaleString()} kg
                        {origNet && <span style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 600, marginLeft: '4px' }}>({origNet.value} {origNet.abbr})</span>}
                      </td>
                      <td>{r.humidity}%</td>
                      <td>{r.impurities}%</td>
                      <td>${r.provisionalPrice.toFixed(2)}</td>
                      <td>
                        {r.lot ? (
                          <span className="status-badge" style={{ backgroundColor: '#ebf8ff', color: '#2b6cb0' }}>
                            {r.lot.code}
                          </span>
                        ) : '—'}
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
