import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload } from 'lucide-react';
import { getMisDocumentos } from '../../services/contratacion-publica.service';
import type { CPDocumentoBandeja } from '../../types/contratacion-publica';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import EntregarModal from '../../components/contratacion-publica/EntregarModal';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { ESTADO_COLOR, ESTADO_LABEL, formatoFecha, mensajeError, tituloMes } from '../../utils/entregasCp';

// Rechazados primero, luego vencidos, luego el resto por fecha límite.
const prioridad = (f: CPDocumentoBandeja) =>
  (f.estado === 'RECHAZADO' ? 0 : f.vencida ? 1 : 2) * 1e13 + Date.parse(f.fechaLimite);

/**
 * "Mis documentos": todo lo que le asignaron a quien entrega, de cualquier
 * entidad, en un solo lugar. Evita tener que adivinar en qué entidad y mes está
 * cada cosa que falta.
 */
export default function MisDocumentosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tablaRef = useResizableColumns('cp-mis-documentos');

  const [filas, setFilas] = useState<CPDocumentoBandeja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [entregando, setEntregando] = useState<CPDocumentoBandeja | null>(null);

  const load = (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError('');
    getMisDocumentos()
      .then(setFilas)
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar tus documentos.')))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  const filtradas = filas.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return f.nombre.toLowerCase().includes(q) || f.entidadNombre.toLowerCase().includes(q);
  });

  const { filas: ordenadas, thProps, SortIcon } = useSortableTable(
    filtradas,
    {
      nombre: (f) => f.nombre,
      entidad: (f) => f.entidadNombre,
      mes: (f) => f.anio * 100 + f.mes,
      fechaLimite: (f) => f.fechaLimite,
      prioridad,
    },
    'prioridad',
  );

  const rechazados = filas.filter((f) => f.estado === 'RECHAZADO').length;
  const vencidos = filas.filter((f) => f.vencida).length;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
            <h1>Mis documentos</h1>
          </div>
        </div>
        {!loading && filas.length > 0 && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>
            {filas.length} por entregar
            {rechazados > 0 && <> · <strong style={{ color: '#c53030' }}>{rechazados} rechazado(s)</strong></>}
            {vencidos > 0 && <> · <strong style={{ color: '#c53030' }}>{vencidos} vencido(s)</strong></>}
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
            placeholder="Buscar por documento o entidad..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => setSearch('')} disabled={!search} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando tus documentos...</div>
        ) : ordenadas.length === 0 ? (
          <div className="empty-state">
            {filas.length === 0 ? 'No tienes documentos pendientes por entregar.' : 'No hay documentos que coincidan con la búsqueda.'}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')} style={{ width: '24%' }}>Documento <SortIcon campo="nombre" /></th>
                  <th {...thProps('entidad')} style={{ width: '21%' }}>Entidad <SortIcon campo="entidad" /></th>
                  <th {...thProps('mes')} style={{ width: '14%' }}>Mes <SortIcon campo="mes" /></th>
                  <th {...thProps('fechaLimite')} style={{ width: '12%' }}>Fecha límite <SortIcon campo="fechaLimite" /></th>
                  <th {...thProps('prioridad')} style={{ width: '16%' }}>Estado <SortIcon campo="prioridad" /></th>
                  <th style={{ textAlign: 'right', width: '13%' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="truncate" title={f.nombre} style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{f.nombre}</span>
                      {f.descripcion && <div style={{ fontSize: '0.75rem', color: '#718096' }}>{f.descripcion}</div>}
                    </td>
                    <td>
                      <span className="truncate" title={f.entidadNombre}>
                        <a
                          href={`/contratacion-publica/entidades/${f.entidadId}?solicitud=${f.solicitudId}`}
                          onClick={(e) => { e.preventDefault(); navigate(`/contratacion-publica/entidades/${f.entidadId}?solicitud=${f.solicitudId}`); }}
                        >
                          {f.entidadNombre}
                        </a>
                      </span>
                    </td>
                    <td><span className="truncate">{tituloMes(f.anio, f.mes)}</span></td>
                    <td>
                      {formatoFecha(f.fechaLimite)}
                      {f.vencida && <div style={{ color: '#c53030', fontWeight: 700, fontSize: '0.72rem' }}>Vencido</div>}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: ESTADO_COLOR[f.estado].bg, color: ESTADO_COLOR[f.estado].fg }}>
                        {ESTADO_LABEL[f.estado]}
                      </span>
                      {f.estado === 'RECHAZADO' && f.motivoRechazo && (
                        <div style={{ fontSize: '0.72rem', color: '#c53030', marginTop: 2 }}>{f.motivoRechazo}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="auth-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }} onClick={() => setEntregando(f)}>
                        <Upload size={13} /> {f.estado === 'RECHAZADO' ? 'Entregar de nuevo' : 'Entregar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {entregando && (
        <EntregarModal
          entrega={entregando}
          onCancel={() => setEntregando(null)}
          onEntregada={() => { setEntregando(null); load(true); }}
        />
      )}
    </div>
  );
}
