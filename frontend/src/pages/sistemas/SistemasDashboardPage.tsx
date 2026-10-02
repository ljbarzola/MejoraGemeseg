import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, Megaphone } from 'lucide-react';
import DonutChart from '../../components/common/DonutChart';
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

// Colores categóricos en orden fijo (validados con el skill dataviz). El color
// va con su nombre y cantidad en la leyenda: nunca es la única señal.
const TIPOS: { tipo: 'ERROR' | 'MEJORA' | 'PERMISO' | 'OTRO'; label: string; color: string }[] = [
  { tipo: 'ERROR', label: 'Errores', color: '#2a78d6' },
  { tipo: 'MEJORA', label: 'Mejoras', color: '#eb6834' },
  { tipo: 'PERMISO', label: 'Permisos', color: '#1baf7a' },
  { tipo: 'OTRO', label: 'Otros', color: '#eda100' },
];

// "—" mientras no haya tickets resueltos; si no, minutos, horas o días + horas.
function formatearHoras(horas: number | null): string {
  if (horas === null) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${Math.round(horas * 10) / 10} h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas - dias * 24);
  return resto ? `${dias} d ${resto} h` : `${dias} d`;
}

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
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <StatCard label="Abiertos" value={stats.abiertos} color="#c53030" onClick={() => navigate('/sistemas/soporte')} />
            <StatCard label="En revisión" value={stats.enRevision} color="#c05621" onClick={() => navigate('/sistemas/soporte')} />
            <StatCard label="Resueltos" value={stats.resueltos} color="#276749" onClick={() => navigate('/sistemas/soporte')} />
            <StatCard label="Este mes" value={stats.totalMes} color="var(--azul-oscuro)" onClick={() => navigate('/sistemas/soporte')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <div className="admin-section" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '14px', color: 'var(--azul-oscuro)' }}>Tickets por tipo</h3>
              <DonutChart
                centerLabel="tickets"
                segments={TIPOS.map((t) => ({ key: t.tipo, label: t.label, color: t.color, value: stats.porTipo?.[t.tipo] ?? 0 }))}
              />
            </div>

            <div className="admin-section" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '14px', color: 'var(--azul-oscuro)' }}>Tiempo promedio de resolución</h3>
              <div style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--azul-oscuro)', lineHeight: 1.1 }}>
                {formatearHoras(stats.tiempoPromedioResolucionHoras)}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#718096' }}>
                {stats.ticketsConResolucion
                  ? `Promedio de ${stats.ticketsConResolucion} ${stats.ticketsConResolucion === 1 ? 'ticket resuelto' : 'tickets resueltos'}, desde que se reporta hasta que queda resuelto.`
                  : 'Aún no hay tickets resueltos.'}
              </p>
            </div>
          </div>
        </>
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
            <button className="btn-secondary" onClick={() => navigate('/sistemas/novedades')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Megaphone size={16} /> Publicar novedad de la app
            </button>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/herramientas')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Gestionar Herramientas
            </button>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/agentes')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Configurar Agentes
            </button>
            <button className="btn-secondary" onClick={() => navigate('/sistemas/base-conocimiento')} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <Wrench size={16} /> Base de conocimiento de Agente Gemeseg
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, onClick }: {
  label: string;
  value: number | string;
  color: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e2e8f0', borderTop: `3px solid ${color}`,
        borderRadius: '10px', padding: '14px 16px', cursor: 'pointer', transition: 'transform 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
    >
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#718096' }}>{label}</div>
    </div>
  );
}
