import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getTrabajadorByCedula } from '../../services/custodia.service';

function formatFechaHora(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ConsultaTrabajador() {
  const navigate = useNavigate();
  const location = useLocation();
  const [cedula, setCedula] = useState('');
  const [mes, setMes] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!cedula.trim()) {
      setError('Por favor ingrese una cédula.');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const res = await getTrabajadorByCedula(cedula.trim(), mes || undefined);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'No se encontraron viajes para la cédula dada.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/custodias')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Consulta de Viajes por Cédula</h1>
          </div>
        </div>
      </div>

      <div className="page-card" style={{ maxWidth: 800, margin: '0 auto 24px' }}>
        <form onSubmit={handleSearch} className="cacao-form">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Número de Cédula *</label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Ej: 0999999999"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Mes (Opcional)</label>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', flex: 1 }}>
              <button type="submit" className="auth-btn" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Buscando...' : 'Buscar Viajes'}
              </button>
            </div>
          </div>
          {error && <div className="form-error" style={{ marginTop: '12px' }}>{error}</div>}
        </form>
      </div>

      {searched && data && (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          {/* GUARD SUMMARY HEADER */}
          <div style={{ padding: '20px', background: '#fff', borderRadius: '14px', borderLeft: '5px solid #100F31', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>GUARDIA / PERSONAL DE CUSTODIA</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#100F31', marginTop: '2px' }}>{data.trabajador.nombre}</div>
              <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#4a5568' }}>Cédula: {data.trabajador.cedula}</div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ textAlign: 'center', padding: '10px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>TOTAL VIAJES</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2b6cb0' }}>{data.resumen.total_viajes}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>INGRESO ACUMULADO</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>${data.resumen.total_usd.toFixed(2)} USD</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: '#fefce8', borderRadius: '10px', marginBottom: '16px', fontSize: '0.8rem', color: '#100F31' }}>
            {data.nota}
          </div>

          {/* HISTORY TABLE */}
          {data.historial?.length === 0 ? (
            <div className="empty-state">No se registraron viajes finalizados en este período.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Guía</th>
                    <th>Tipo</th>
                    <th>Rol Desempeñado</th>
                    <th>Cliente</th>
                    <th>Placa</th>
                    <th>Ruta (Salida ➔ Llegada)</th>
                    <th>Fecha / Hora Salida</th>
                    <th style={{ textAlign: 'right' }}>Monto (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.historial.map((v: any) => (
                    <tr key={v.id || v.numero_guia}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2b6cb0' }}>{v.numero_guia}</td>
                      <td>
                        <span className="status-badge" style={{ background: '#e2e8f0', color: '#2d3748' }}>
                          {v.tipo_custodia}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: v.rol === 'Chofer' ? '#d97706' : '#2b6cb0' }}>
                          {v.rol}
                        </span>
                      </td>
                      <td>{v.cliente || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{v.placa || '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {v.direccion_salida || '—'} ➔ {v.direccion_llegada || '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#718096' }}>{formatFechaHora(v.fecha_hora_salida)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
                        ${v.monto_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
