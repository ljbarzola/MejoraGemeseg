import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCustodias, deleteCustodia } from '../../services/custodia.service';
import EstadoSelect from '../../components/custodias/EstadoSelect';
import CustodiaDetalleModal from '../../components/custodias/CustodiaDetalleModal';

const TYPE_COLORS: Record<string, string> = {
  HACIENDA: '#276749',
  PUERTO: '#2b6cb0',
  VIP: '#6b46c1',
};

const TYPE_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

function formatFecha(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function CustodiasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [custodias, setCustodias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [detalle, setDetalle] = useState<any>(null);

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    if (filtroTipo) params.tipo = filtroTipo;
    if (filtroEstado) params.estado = filtroEstado;
    getCustodias(params).then(setCustodias).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta custodia?')) return;
    await deleteCustodia(id);
    load();
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/dashboard')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Custodias</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/custodias/new')}>+ Nueva Custodia</button>
      </div>

      <div className="admin-section">
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }} />
          <span style={{ color: '#718096', alignSelf: 'center' }}>a</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}>
            <option value="">Todos los tipos</option>
            <option value="HACIENDA">Hacienda</option>
            <option value="PUERTO">Puerto</option>
            <option value="VIP">VIP</option>
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}>
            <option value="">Todos los estados</option>
            <option value="LISTO_PARA_CUSTODIAR">Listo para Custodiar</option>
            <option value="EN_CAMINO">En Camino</option>
            <option value="LLEGO">Llegó</option>
          </select>
          <button className="auth-btn" onClick={load} style={{ padding: '10px 20px' }}>Filtrar</button>
          {(fechaInicio || fechaFin || filtroTipo || filtroEstado) && (
            <button className="btn-secondary" onClick={() => { setFechaInicio(''); setFechaFin(''); setFiltroTipo(''); setFiltroEstado(''); }}>Limpiar</button>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Cargando custodias...</div>
        ) : custodias.length === 0 ? (
          <div className="empty-state">No hay custodias registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guía</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Personal</th>
                  <th>Horario</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {custodias.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2b6cb0' }}>{c.numeroGuia}</td>
                    <td>
                      <EstadoSelect custodiaId={c.id} estadoActual={c.estado} onUpdated={load} />
                    </td>
                    <td>
                      <span className="status-badge" style={{
                        backgroundColor: TYPE_COLORS[c.tipoCustodia] + '20',
                        color: TYPE_COLORS[c.tipoCustodia],
                      }}>
                        {TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{c.cliente || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.placa || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{c.choferName}</div>
                      <div>{c.custodio1Name}</div>
                      <div>{c.custodio2Name}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#718096' }}>
                      {c.fechaHoraSalida && <div>S: {formatFechaHora(c.fechaHoraSalida)}</div>}
                      {c.fechaHoraLlegada && <div>L: {formatFechaHora(c.fechaHoraLlegada)}</div>}
                      {!c.fechaHoraSalida && <div>{formatFecha(c.createdAt)}</div>}
                    </td>
                    <td className="no-print">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button onClick={() => setDetalle(c)} style={{ fontSize: '0.78rem', color: '#1e3a5f', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Ver Detalle
                        </button>
                        <button onClick={() => handleDelete(c.id)} style={{ fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CustodiaDetalleModal custodia={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
