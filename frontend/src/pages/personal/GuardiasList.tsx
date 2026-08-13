import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAvailableCustodios } from '../../services/custodia.service';
import GuardiaDetailModal from '../../components/personal/GuardiaDetailModal';

interface GuardiaItem {
  name: string;
  cedula: string;
  status: string;
}

export default function GuardiasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [guardias, setGuardias] = useState<GuardiaItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedGuardia, setSelectedGuardia] = useState<GuardiaItem | null>(null);

  const loadGuardias = () => {
    setLoading(true);
    getAvailableCustodios()
      .then((data) => {
        if (Array.isArray(data)) setGuardias(data);
        else if (data && Array.isArray(data.value)) setGuardias(data.value);
      })
      .catch(() => setGuardias([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGuardias();
  }, []);

  const filtered = guardias.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.cedula && g.cedula.includes(search))
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/personal')}>
            ← Volver
          </button>
          <div>
            <p className="page-eyebrow">PERSONAL Y RECURSOS HUMANOS</p>
            <h1>Listado de Guardias</h1>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <div className="filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Buscar por nombre o cédula de guardia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '0.9rem',
            }}
          />
          {search && (
            <button className="btn-secondary" onClick={() => setSearch('')}>
              Limpiar
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Cargando listado de guardias registrados...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No se encontraron guardias registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guardia / Nombre Completo</th>
                  <th>Cédula</th>
                  <th>Estado / Proceso</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.cedula || g.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.2rem' }}>👮</span>
                        <div style={{ fontWeight: 700, color: '#100F31' }}>{g.name}</div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{g.cedula || '—'}</td>
                    <td>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          background: '#f1f5f9',
                          color: '#334155',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedGuardia(g)}
                        style={{
                          padding: '6px 14px',
                          background: '#100F31',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        Ver Expediente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GuardiaDetailModal guardia={selectedGuardia} onClose={() => setSelectedGuardia(null)} />
    </div>
  );
}
