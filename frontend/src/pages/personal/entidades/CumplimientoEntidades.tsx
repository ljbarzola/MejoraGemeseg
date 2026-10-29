import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Hourglass, ClipboardCheck, Info, Settings } from 'lucide-react';
import {
  getComplianceOverview,
  type ComplianceOverviewItem,
} from '../../../services/entidades.service';
import GuardiaComplianceModal from '../../../components/personal/GuardiaComplianceModal';
import NotificationConfigModal from '../../../components/personal/NotificationConfigModal';
import { cedulaVisible } from '../../../utils/postulacionValidacion';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

const TIPO_COLOR: Record<string, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};

// Las alertas de un guardia (columna «Alertas»): un guardia puede tener varias a la vez; sin ninguna está «Al día».
const ALERTAS_ORDEN = ['VENCIDO', 'POR_VENCER', 'FALTANTE', 'AL_DIA'];
const ALERTAS_ETIQUETA: Record<string, string> = {
  VENCIDO: 'Con algo vencido',
  POR_VENCER: 'Con algo por vencer',
  FALTANTE: 'Con algo faltante',
  AL_DIA: 'Al día',
};
const alertasDe = (item: ComplianceOverviewItem): { valor: string; etiqueta: string }[] => {
  const claves: string[] = [];
  if (item.requisitosVencidos.length > 0) claves.push('VENCIDO');
  if (item.requisitosPorVencer.length > 0) claves.push('POR_VENCER');
  if (item.requisitosFaltantes.length > 0) claves.push('FALTANTE');
  if (claves.length === 0) claves.push('AL_DIA');
  return claves.map((k) => ({ valor: k, etiqueta: ALERTAS_ETIQUETA[k] }));
};
const porcentajeCumplido = (item: ComplianceOverviewItem) =>
  item.totalRequisitos > 0 ? Math.round((item.cumplidos / item.totalRequisitos) * 100) : 0;

export default function CumplimientoEntidades() {
  const navigate = useNavigate();
  const location = useLocation();

  const [overview, setOverview] = useState<ComplianceOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCedula, setSelectedCedula] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getComplianceOverview()
      .then((o) => setOverview(o || []))
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el cumplimiento.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openDetail = (cedula: string) => setSelectedCedula(cedula);
  const closeDetail = () => setSelectedCedula(null);

  // Los filtros viven en la cabecera de cada columna (useColumnFilters); aquí solo falta el buscador general.
  const cf = useColumnFilters<ComplianceOverviewItem>(overview, [
    { key: 'guardia', etiqueta: 'Guardia', tipo: 'texto', getValue: (i) => `${i.asignacion.nombreGuardia} ${cedulaVisible(i.asignacion.cedula)}` },
    {
      key: 'entidad', etiqueta: 'Entidad', tipo: 'valores',
      getValues: (i) => ({ valor: String(i.entidad.id), etiqueta: i.entidad.nombre }),
    },
    { key: 'cumplimiento', etiqueta: 'Cumplimiento (%)', tipo: 'numero', getValue: porcentajeCumplido, formato: (n) => `${n}%` },
    { key: 'alertas', etiqueta: 'Alertas', tipo: 'valores', orden: ALERTAS_ORDEN, getValues: alertasDe },
  ]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cf.filas;
    return cf.filas.filter((item) =>
      item.asignacion.nombreGuardia.toLowerCase().includes(search.toLowerCase()) ||
      item.asignacion.cedula.includes(search) ||
      item.requisitosFaltantes.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase())) ||
      item.requisitosVencidos.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase())) ||
      item.requisitosPorVencer.some((r) => r.requisito.nombre.toLowerCase().includes(search.toLowerCase())));
  }, [cf.filas, search]);

  const hayFiltrosActivos = search.trim() !== '' || cf.hayFiltros;
  const limpiarTodo = () => { setSearch(''); cf.limpiar(); };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS · CUMPLIMIENTO</p>
            <h1>Cumplimiento</h1>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : undefined} /> {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            <button
              type="button"
              className="btn-icon-toolbar"
              onClick={() => setShowConfigModal(true)}
              title="Notificaciones"
              aria-label="Notificaciones"
            >
              <Settings size={18} />
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
          . Si algo está desactualizado, sincroniza desde ahí.
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
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltrosActivos} />
        </div>

        <ChipsFiltros cf={cf} />

        {loading ? (
          <div className="loading-state">Cargando cumplimiento...</div>
        ) : overview.length === 0 ? (
          <div className="empty-state">No hay guardias con una asignación activa a una entidad todavía.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guardia<ColumnFilter cf={cf} col="guardia" orden={cf.ordenDe('guardia')} /></th>
                  <th>Entidad<ColumnFilter cf={cf} col="entidad" orden={cf.ordenDe('entidad')} /></th>
                  <th style={{ minWidth: '160px' }}>Cumplimiento<ColumnFilter cf={cf} col="cumplimiento" orden={cf.ordenDe('cumplimiento')} /></th>
                  <th>Alertas<ColumnFilter cf={cf} col="alertas" orden={cf.ordenDe('alertas')} /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <FilaSinResultados columnas={5} mensaje="Ningún guardia coincide con estos filtros." onLimpiar={limpiarTodo} />
                )}
                {filtered.map((item) => {
                  const faltantes = item.requisitosFaltantes.length;
                  const vencidos = item.requisitosVencidos.length;
                  const porVencer = item.requisitosPorVencer.length;
                  return (
                    <tr key={item.asignacion.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{item.asignacion.nombreGuardia}</div>
                        <div style={{ fontSize: '0.72rem', color: '#718096', fontFamily: 'monospace' }}>{cedulaVisible(item.asignacion.cedula)}</div>
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
      {showConfigModal && (
        <NotificationConfigModal onClose={() => setShowConfigModal(false)} />
      )}
    </div>
  );
}
