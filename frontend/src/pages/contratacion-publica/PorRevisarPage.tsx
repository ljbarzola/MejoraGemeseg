import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import {
  aprobarDocumento,
  getPorRevisar,
  rechazarDocumento,
} from '../../services/contratacion-publica.service';
import type { CPDocumentoBandeja } from '../../types/contratacion-publica';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import RevisionPanel, { type DocumentoRevisable } from '../../components/contratacion-publica/RevisionPanel';
import { usePerm } from '../../contexts/PermissionsContext';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import { formatoFecha, mensajeError, tituloMes } from '../../utils/entregasCp';

const aRevisable = (f: CPDocumentoBandeja): DocumentoRevisable => ({
  id: f.id,
  nombre: f.nombre,
  descripcion: f.descripcion,
  entidadNombre: f.entidadNombre,
  periodo: tituloMes(f.anio, f.mes),
  estado: f.estado,
  fechaLimite: f.fechaLimite,
  vencida: f.vencida,
  origen: f.origen ?? null,
  url: f.url ?? null,
  motivoRechazo: f.motivoRechazo,
  entregadoPorNombre: f.entregadoPorNombre ?? null,
  entregadoAt: f.entregadoAt ?? null,
  revisadoPorNombre: f.revisadoPorNombre ?? null,
  revisadoAt: f.revisadoAt ?? null,
});

/**
 * "Por aprobar" (ruta /por-revisar): todo lo que otras áreas entregaron y todavía no se revisó, de
 * todas las entidades juntas (lo más antiguo primero). Desde aquí se revisa uno
 * tras otro con el panel dividido, sin entrar entidad por entidad.
 */
export default function PorRevisarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-por-revisar');

  const [filas, setFilas] = useState<CPDocumentoBandeja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<{ items: DocumentoRevisable[]; inicioId: number } | null>(null);

  const load = (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError('');
    getPorRevisar()
      .then(setFilas)
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar lo que falta aprobar.')))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (canEdit) load(); }, [canEdit]);

  const filtradas = filas.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      f.nombre.toLowerCase().includes(q) ||
      f.entidadNombre.toLowerCase().includes(q) ||
      (f.entregadoPorNombre ?? '').toLowerCase().includes(q)
    );
  });

  const { filas: ordenadas, thProps, SortIcon } = useSortableTable(
    filtradas,
    {
      nombre: (f) => f.nombre,
      entidad: (f) => f.entidadNombre,
      mes: (f) => f.anio * 100 + f.mes,
      entregadoPor: (f) => f.entregadoPorNombre,
      entregadoAt: (f) => (f.entregadoAt ? Date.parse(f.entregadoAt) : null),
      fechaLimite: (f) => f.fechaLimite,
    },
    'entregadoAt',
  );

  // Solo el personal de Contratación Pública revisa; el resto tiene su propia bandeja.
  if (!canEdit) return <Navigate to="/contratacion-publica/mis-documentos" replace />;

  const abrirPanel = (inicioId: number) => {
    // Foto de la lista tal como se ve ahora (con la búsqueda y el orden elegidos).
    setPanel({ items: ordenadas.map(aRevisable), inicioId });
  };

  const cerrarPanel = () => {
    setPanel(null);
    load(true);
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
            <h1>Por aprobar</h1>
          </div>
          <div className="header-actions">
            <button className="auth-btn" disabled={ordenadas.length === 0} onClick={() => ordenadas[0] && abrirPanel(ordenadas[0].id)}>
              <Search size={16} /> Revisar uno tras otro
            </button>
          </div>
        </div>
        {!loading && filas.length > 0 && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>
            {filas.length} documento(s) esperando tu aprobación
            {filas.some((f) => f.vencida) && <> · <strong style={{ color: '#c53030' }}>{filas.filter((f) => f.vencida).length} vencido(s)</strong></>}
          </p>
        )}
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por documento, entidad o quién lo entregó..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => setSearch('')} disabled={!search} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando lo que falta aprobar...</div>
        ) : ordenadas.length === 0 ? (
          <div className="empty-state">
            {filas.length === 0 ? 'No hay documentos por aprobar. Todo lo entregado ya fue revisado.' : 'No hay documentos que coincidan con la búsqueda.'}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')} style={{ width: '24%' }}>Documento <SortIcon campo="nombre" /></th>
                  <th {...thProps('entidad')} style={{ width: '20%' }}>Entidad <SortIcon campo="entidad" /></th>
                  <th {...thProps('mes')} style={{ width: '12%' }}>Mes <SortIcon campo="mes" /></th>
                  <th {...thProps('entregadoAt')} style={{ width: '20%' }}>Entregado <SortIcon campo="entregadoAt" /></th>
                  <th {...thProps('fechaLimite')} style={{ width: '12%' }}>Fecha límite <SortIcon campo="fechaLimite" /></th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f) => (
                  <tr key={f.id} onClick={() => abrirPanel(f.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="truncate" title={f.nombre} style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{f.nombre}</span>
                      {f.departmentName && <div style={{ fontSize: '0.75rem', color: '#718096' }}>{f.departmentName}</div>}
                    </td>
                    <td><span className="truncate" title={f.entidadNombre}>{f.entidadNombre}</span></td>
                    <td><span className="truncate">{tituloMes(f.anio, f.mes)}</span></td>
                    <td>
                      <span className="truncate">{f.entregadoPorNombre ?? '—'}</span>
                      <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                        {f.entregadoAt ? formatFechaHoraSync(f.entregadoAt) : ''}{f.origen === 'ENLACE' ? ' · enlace' : ''}
                      </div>
                    </td>
                    <td>
                      {formatoFecha(f.fechaLimite)}
                      {f.vencida && <div style={{ color: '#c53030', fontWeight: 700, fontSize: '0.72rem' }}>Vencido</div>}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                      <button className="auth-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }} onClick={() => abrirPanel(f.id)}>
                        <Search size={13} /> Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {panel && (
        <RevisionPanel
          items={panel.items}
          inicioId={panel.inicioId}
          puedeRevisar
          onClose={cerrarPanel}
          onAprobar={async (id) => { await aprobarDocumento(id); }}
          onRechazar={async (id, motivo) => { await rechazarDocumento(id, motivo); }}
        />
      )}
    </div>
  );
}
