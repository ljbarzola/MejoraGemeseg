import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { getPersonalDashboard } from '../../services/personal.service';
import RrhhHelpModal from '../../components/personal/RrhhHelpModal';

function KpiCard({
  icon, value, label, color, bg, onClick,
}: { icon: string; value: number; label: string; color: string; bg?: string; onClick: () => void }) {
  const cardStyle: CSSProperties = {
    background: bg || 'white', borderRadius: '16px', padding: '18px 20px', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', transition: 'transform 0.15s, box-shadow 0.15s',
    borderLeft: `4px solid ${color}`, display: 'flex', alignItems: 'center', gap: '14px',
  };
  return (
    <div
      onClick={onClick}
      style={cardStyle}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
    >
      <div style={{ fontSize: '1.6rem', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '2px' }}>{label}</div>
      </div>
    </div>
  );
}

export default function PersonalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    getPersonalDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Cargando dashboard...</div>;

  const sinAsignacion = data?.guardiasSinAsignacion || 0;
  const documentosPendientes = data?.documentosVencidosOPorVencer || 0;
  const movimientosEnProceso = data?.movimientosEnProceso || 0;

  // Fila de atención: solo cosas que pueden requerir una acción tuya. Se
  // pintan con tinte de color cuando el valor es > 0, para que resalten sin
  // necesitar leer el número — y llevan a la vista ya filtrada, no solo al
  // número.
  const atencionCards = [
    {
      label: 'Guardias sin asignación', value: sinAsignacion, icon: '🛡️',
      color: sinAsignacion > 0 ? '#975a16' : '#a0aec0', bg: sinAsignacion > 0 ? '#fffaf0' : undefined,
      onClick: () => navigate('/rrhh/guardias', { state: { filtroEntidad: 'SIN_ASIGNAR' } }),
    },
    {
      label: 'Documentos vencidos o por vencer', value: documentosPendientes, icon: '⚠️',
      color: documentosPendientes > 0 ? '#c53030' : '#a0aec0', bg: documentosPendientes > 0 ? '#fff5f5' : undefined,
      onClick: () => navigate('/rrhh/cumplimiento'),
    },
    {
      label: 'Movimientos en proceso', value: movimientosEnProceso, icon: '🔀',
      color: movimientosEnProceso > 0 ? '#2b6cb0' : '#a0aec0', bg: movimientosEnProceso > 0 ? '#ebf8ff' : undefined,
      onClick: () => navigate('/rrhh/historial'),
    },
  ];

  const resumenCards = [
    { label: 'Reclutamiento', value: data?.totalCandidates || 0, icon: '👤', color: '#2b6cb0', onClick: () => navigate('/rrhh/kanban') },
    { label: 'Documentos Pendientes', value: data?.pendingContracts || 0, icon: '📄', color: '#6b46c1', onClick: () => navigate('/rrhh/contracts') },
  ];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">RECURSOS HUMANOS</p>
          <h1>Dashboard de Personal</h1>
        </div>
        <button className="btn-secondary" onClick={() => setShowHelp(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <HelpCircle size={16} /> Ayuda
        </button>
      </div>

      {showHelp && <RrhhHelpModal onClose={() => setShowHelp(false)} />}

      <h2 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: 'var(--azul-oscuro)' }}>Requiere tu atención</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {atencionCards.map((card) => <KpiCard key={card.label} {...card} />)}
      </div>

      <h2 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: 'var(--azul-oscuro)' }}>Resumen general</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {resumenCards.map((card) => <KpiCard key={card.label} {...card} />)}
      </div>

      <div className="admin-section">
        <h2 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>Accesos Directos</h2>
        {/*
          Solo lo que no tiene ya un acceso rápido más arriba (Reclutamiento,
          Documentación, Cumplimiento e Historial ya se llega desde las tarjetas
          de KPI) ni está a un clic en el sidebar de todas formas — Guardias,
          Reclutamiento y Personal Administrativo ya tienen su propio grupo ahí.
          "Bitácoras" (/rrhh/logs, LogEntries.tsx) se quitó de aquí y del sidebar
          a pedido del cliente: no se estaba usando. El código y los datos ya
          guardados quedan intactos por si se retoma más adelante.
        */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            { label: 'Candidatos', path: '/rrhh/candidates', icon: '👤' },
            { label: 'Personal Administrativo', path: '/rrhh/administrativo', icon: '🏢' },
            { label: 'Entidades y Requisitos', path: '/rrhh/entidades', icon: '📋' },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '14px 18px',
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--azul-oscuro)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--azul-claro)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
            >
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
