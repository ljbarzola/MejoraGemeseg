import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertTriangle, Hourglass, ClipboardCheck, Info } from 'lucide-react';
import {
  getComplianceOverview,
  getEntidades,
  type ComplianceOverviewItem,
  type Entidad,
} from '../../../services/entidades.service';
import GuardiaComplianceModal from '../../../components/personal/GuardiaComplianceModal';

const TIPO_COLOR: Record<string, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};

type FiltroEstado = 'TODOS' | 'VENCIDO' | 'POR_VENCER' | 'FALTANTE' | 'AL_DIA';

export default function CumplimientoEntidades() {
  const navigate = useNavigate();
  const location = useLocation();

  const [overview, setOverview] = useState<ComplianceOverviewItem[]>([]);
  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCedula, setSelectedCedula] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState<number | 'TODAS'>('TODAS');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([getComplianceOverview(), getEntidades()])
      .then(([o, e]) => {
        setOverview(o || []);
        setEntidades(e || []);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el cumplimiento.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openDetail = (cedula: string) => setSelectedCedula(cedula);
  const closeDetail = () => setSelectedCedula(null);

  const filtered = useMemo(() => {
    return overview.filter((item) => {
      const matchesSearch =
        !search.trim() ||
        item.asignacion.nombreGuardia.toLowerCase().includes(search.toLowerCase()) ||
        item.asignacion.cedula.includes(search) ||
        item.requisitosFaltantes.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase())) ||
        item.requisitosVencidos.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase())) ||
        item.requisitosPorVencer.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase()));
      if (!matchesSearch) return false;

      if (filtroEntidad !== 'TODAS' && item.entidad.id !== filtroEntidad) return false;

      if (filtroEstado === 'VENCIDO' && item.requisitosVencidos.length === 0) return false;
      if (filtroEstado === 'POR_VENCER' && item.requisitosPorVencer.length === 0) return false;
      if (filtroEstado === 'FALTANTE' && item.requisitosFaltantes.length === 0) return false;
      if (
        filtroEstado === 'AL_DIA' &&
        (item.requisitosFaltantes.length > 0 || item.requisitosVencidos.length > 0 || item.requisitosPorVencer.length > 0)
      )
        return false;

      return true;
    });
  }, [overview, search, filtroEntidad, filtroEstado]);

  const hayFiltrosActivos = search.trim() !== '' || filtroEntidad !== 'TODAS' || filtroEstado !== 'TODOS';

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS · CUMPLIMIENTO</p>
            <h1>Cumplimiento</h1>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : undefined} /> {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#2b6cb0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Info size={15} style={{ flexShrink: 0 }} />
        <span>
          Esta información se sincroniza desde la carpeta de Drive configurada en{' '}
          <button
            onClick={() => navigate('/rrhh/guardias', { state: { from: location.pathname } })}
            style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            Listado de Guardias
          </button>
          . Si algo está desactualizado, sincronizá desde ahí.
        </span>
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: 0 }}>
            <ClipboardCheck size={16} /> Guardias con asignación activa ({filtered.length}{filtered.length !== overview.length ? ` de ${overview.length}` : ''})
          </h2>
        </div>

        <div className="filter-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar por guardia, cédula o documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: '200px', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
          <select
            value={String(filtroEntidad)}
            onChange={(e) => setFiltroEntidad(e.target.value === 'TODAS' ? 'TODAS' : Number(e.target.value))}
            style={{ padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0' }}
          >
            <option value="TODAS">Todas las entidades</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} style={{ padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
            <option value="TODOS">Cualquier estado</option>
            <option value="VENCIDO">Con algo vencido</option>
            <option value="POR_VENCER">Con algo por vencer</option>
            <option value="FALTANTE">Con algo faltante</option>
            <option value="AL_DIA">Al día</option>
          </select>
          {hayFiltrosActivos && (
            <button className="btn-secondary" onClick={() => { setSearch(''); setFiltroEntidad('TODAS'); setFiltroEstado('TODOS'); }}>
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Cargando cumplimiento...</div>
        ) : overview.length === 0 ? (
          <div className="empty-state">No hay guardias con una asignación activa a una entidad todavía.</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Ningún guardia coincide con estos filtros.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guardia</th>
                  <th>Entidad</th>
                  <th style={{ minWidth: '160px' }}>Cumplimiento</th>
                  <th>Alertas</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const faltantes = item.requisitosFaltantes.length;
                  const vencidos = item.requisitosVencidos.length;
                  const porVencer = item.requisitosPorVencer.length;
                  return (
                    <tr key={item.asignacion.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{item.asignacion.nombreGuardia}</div>
                        <div style={{ fontSize: '0.72rem', color: '#718096', fontFamily: 'monospace' }}>{item.asignacion.cedula}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {item.entidad.nombre}
                          <span className="status-badge" style={{ background: TIPO_COLOR[item.entidad.tipo]?.bg, color: TIPO_COLOR[item.entidad.tipo]?.fg }}>
                            {item.entidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden', minWidth: '60px' }}>
                            <div
                              style={{
                                width: item.totalRequisitos > 0 ? `${Math.round((item.cumplidos / item.totalRequisitos) * 100)}%` : '0%',
                                background: vencidos > 0 || faltantes > 0 ? '#c53030' : porVencer > 0 ? '#d97706' : '#22c55e',
                                height: '100%',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--azul-oscuro)', whiteSpace: 'nowrap' }}>
                            {item.cumplidos}/{item.totalRequisitos}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {faltantes > 0 && (
                            <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={12} /> {faltantes} faltante{faltantes > 1 ? 's' : ''}
                            </span>
                          )}
                          {vencidos > 0 && (
                            <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={12} /> {vencidos} vencido{vencidos > 1 ? 's' : ''}
                            </span>
                          )}
                          {porVencer > 0 && (
                            <span className="status-badge" style={{ background: '#fefcbf', color: '#975a16', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Hourglass size={12} /> {porVencer} por vencer
                            </span>
                          )}
                          {faltantes === 0 && vencidos === 0 && porVencer === 0 && (
                            <span className="status-badge" style={{ background: '#c6f6d5', color: '#276749' }}>Al día</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => openDetail(item.asignacion.cedula)}
                          style={{ padding: '6px 14px', background: 'var(--azul-oscuro)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLE DE CUMPLIMIENTO (pieza compartida con GuardiasList.tsx) */}
      <GuardiaComplianceModal cedula={selectedCedula} onClose={closeDetail} onChanged={load} />
    </div>
  );
}
