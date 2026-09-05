import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPersonalDashboard } from '../../services/personal.service';

export default function PersonalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPersonalDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Cargando dashboard...</div>;

  const cards = [
    { label: 'Reclutamiento', value: data?.totalCandidates || 0, icon: '👤', color: '#2b6cb0', path: '/personal/kanban' },
    { label: 'Certificaciones Activas', value: data?.activeCertifications || 0, icon: '📋', color: '#276749', path: '/personal/certifications' },
    { label: 'Contratos Pendientes', value: data?.pendingContracts || 0, icon: '📄', color: '#6b46c1', path: '/personal/contracts' },
    { label: 'Alertas de Vencimiento', value: data?.alertCount || 0, icon: '⚠️', color: '#c53030', path: '/personal/certifications' },
  ];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MODULO PERSONAL</p>
          <h1>Dashboard de Personal</h1>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px', marginBottom: '24px' }}>
        {cards.map((card) => (
          <div
            key={card.label}
            onClick={() => navigate(card.path)}
            style={{
              background: 'white', borderRadius: '16px', padding: '24px', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', transition: 'transform 0.15s, box-shadow 0.15s',
              borderLeft: `4px solid ${card.color}`,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{card.icon}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '0.9rem', color: '#718096', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <h2 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>Accesos Directos</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px' }}>
          {[
            { label: 'Tablero de Reclutamiento', path: '/personal/kanban', icon: '📋' },
            { label: 'Candidatos', path: '/personal/candidates', icon: '👤' },
            { label: 'Contratos', path: '/personal/contracts', icon: '📄' },
            { label: 'Certificaciones', path: '/personal/certifications', icon: '🎓' },
            { label: 'Bitácoras', path: '/personal/logs', icon: '📝' },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--azul-oscuro)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--azul-claro)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
            >
              <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
