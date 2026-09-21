import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, AlertCircle, Clock, CheckCircle, BarChart3 } from 'lucide-react';
import {
  getSistemasDashboardStats,
  getTicketsSoporte,
  type TicketSoporte,
  type SistemasDashboardStats,
} from '../../services/sistemas.service';

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  ABIERTO: { bg: '#fed7d7', fg: '#c53030' },
  EN_REVISION: { bg: '#feebc8', fg: '#c05621' },
  RESUELTO: { bg: '#c6f6d5', fg: '#276749' },
};

const TIPO_LABEL: Record<string, string> = {
  ERROR: 'Error',
  MEJORA: 'Mejora',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

export default function SistemasDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SistemasDashboardStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<TicketSoporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSistemasDashboardStats(), getTicketsSoporte()])
      .then(([s, tickets]) => {
        setStats(s);
        setRecentTickets(tickets.slice(0, 5));
      })
      .catch((err: any) => setError(err.response?.data?.message || 'Error al cargar datos'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Cargando dashboard...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench size={22} /> Sistemas
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', color: '#718096', fontSize: '0.88rem' }}>
        Panel de control del modulo de Sistemas.
      </p>

      {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          <StatCard icon={<AlertCircle size={20} />} label="Abiertos" value={stats.abiertos} color="#c53030" bg="#fed7d7" onClick={() => navigate('/sistemas/soporte')} />
          <StatCard icon={<Clock size={20} />} label="En revision" value={stats.enRevision} color="#c05621" bg="#feebc8" onClick={() => navigate('/sistemas/soporte')} />
          <StatCard icon={<CheckCircle size={20} />} label="Resueltos" value={stats.resueltos} color="#276749" bg="#c6f6d5" onClick={() => navigate('/sistemas/soporte')} />
          <StatCard icon={<BarChart3 size={20} />} label="Este mes" value={stats.totalMes} color="var(--azul-oscuro)" bg="#ebf4ff" onClick={() => navigate('/sistemas/soporte')} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="admin-section" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--azul-oscuro)' }}>Ultimos tickets</h3>
          {recentTickets.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No hay tickets todavia.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentTickets.map((t) => {
                const color = ESTADO_COLOR[t.estado] || ESTADO_COLOR.ABIERTO;
                return (
                  <div
                    key={t.id}
                    onClick={() => navigate('/sistemas/soporte')}
                    style={{
                      padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#718096' }}>{TIPO_LABEL[t.tipo]}</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>{t.titulo}</div>
                      <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>{new Date(t.createdAt).toLocaleDateString('es-EC')}</span>
                    </div>
                    <span className="status-badge" style={{ background: color.bg, color: color.fg, fontSize: '0.72rem' }}>
                      {t.estado.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-section" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--azul-oscuro)' }}>Accesos rapidos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/soporte')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Ver Soporte Tecnico
            </button>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/herramientas')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Gestionar Herramientas
            </button>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/agentes')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Configurar Agentes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: bg, borderRadius: '12px', padding: '18px 16px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px',
        transition: 'transform 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
    >
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: '0.78rem', color: '#718096' }}>{label}</div>
      </div>
    </div>
  );
}
