import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Eye, Pencil, Trash2 } from 'lucide-react';
import { getContratos, deleteContrato } from '../../../services/contratacion-publica.service';
import type { CPContrato } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { useSortableTable } from '../../../hooks/useSortableTable';

const ESTADO_LABEL: Record<string, string> = { ACTIVO: 'Activo', FINALIZADO: 'Finalizado' };
const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  ACTIVO: { bg: '#c6f6d5', fg: '#276749' },
  FINALIZADO: { bg: '#e2e8f0', fg: '#4a5568' },
};

function formatFecha(date: string) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ContratosList() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-contratos');

  const [contratos, setContratos] = useState<CPContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    getContratos()
      .then(setContratos)
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los contratos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Filtros en la cabecera de cada columna (antes eran dos selects que pedían la lista filtrada al servidor).
  const cf = useColumnFilters<CPContrato>(contratos, [
    { key: 'numero', etiqueta: 'Número', tipo: 'texto', getValue: (c) => c.numero },
    { key: 'entidad', etiqueta: 'Entidad', tipo: 'valores', vacio: 'Sin entidad', getValues: (c) => (c.entidad ? { valor: String(c.entidadId), etiqueta: c.entidad.nombre } : null) },
    { key: 'objeto', etiqueta: 'Objeto', tipo: 'texto', getValue: (c) => c.objeto },
    { key: 'puestos', etiqueta: 'Puestos', tipo: 'numero', getValue: (c) => c._count?.puestos ?? 0 },
    // «Vigente en»: el contrato cuenta si estuvo en pie en algún momento del periodo.
    { key: 'fechaFin', etiqueta: 'Vigente en', tipo: 'fecha', getValue: (c) => c.fechaInicio, getFin: (c) => c.fechaFin },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_LABEL), getValues: (c) => ({ valor: c.estado, etiqueta: ESTADO_LABEL[c.estado] || c.estado }) },
  ]);

  const filtered = cf.filas.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.numero.toLowerCase().includes(q) ||
      c.objeto.toLowerCase().includes(q) ||
      (c.entidad?.nombre || '').toLowerCase().includes(q)
    );
  });

  const { filas, thProps, ordenDe } = useSortableTable(
    filtered,
    {
      numero: (c) => c.numero,
      entidad: (c) => c.entidad?.nombre,
      objeto: (c) => c.objeto,
      puestos: (c) => c._count?.puestos ?? 0,
      fechaFin: (c) => c.fechaFin,
      estado: (c) => ESTADO_LABEL[c.estado] || c.estado,
    },
    'fechaFin',
    'desc',
  );

  const handleConfirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id == null) return;
    try {
      await deleteContrato(id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el contrato.');
    }
  };

  const hayFiltros = !!search || cf.hayFiltros;
  const limpiarTodo = () => { setSearch(''); cf.limpiar(); };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
          <h1>Contratos</h1>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/contratacion-publica/entidades')}>
            <Building2 size={16} /> Entidades
          </button>
          {canEdit && (
            <button className="auth-btn" onClick={() => navigate('/contratacion-publica/contratos/nuevo')}>
              <Plus size={16} /> Nuevo Contrato
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, objeto o entidad..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando contratos...</div>
        ) : contratos.length === 0 ? (
          <div className="empty-state">No hay contratos registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('numero')}>Número <ColumnFilter cf={cf} col="numero" orden={ordenDe('numero')} /></th>
                  <th {...thProps('entidad')}>Entidad <ColumnFilter cf={cf} col="entidad" orden={ordenDe('entidad')} /></th>
                  <th {...thProps('objeto')}>Objeto <ColumnFilter cf={cf} col="objeto" orden={ordenDe('objeto')} /></th>
                  <th {...thProps('puestos')}>Puestos <ColumnFilter cf={cf} col="puestos" orden={ordenDe('puestos')} /></th>
                  <th {...thProps('fechaFin')}>Vigencia <ColumnFilter cf={cf} col="fechaFin" orden={ordenDe('fechaFin')} /></th>
                  <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>
                  <th className="col-acciones col-acciones--ancha" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={7}
                    mensaje="No hay contratos que coincidan con los filtros."
                    onLimpiar={hayFiltros ? limpiarTodo : undefined}
                  />
                )}
                {filas.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/contratacion-publica/contratos/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2b6cb0' }}>{c.numero}</td>
                    <td><span className="truncate">{c.entidad?.nombre || '—'}</span></td>
                    <td><span className="truncate">{c.objeto}</span></td>
                    <td>{c._count?.puestos ?? 0}</td>
                    <td style={{ fontSize: '0.82rem' }}>{formatFecha(c.fechaInicio)} — {formatFecha(c.fechaFin)}</td>
                    <td>
                      <span className="status-badge" style={{ background: ESTADO_COLOR[c.estado]?.bg, color: ESTADO_COLOR[c.estado]?.fg }}>
                        {ESTADO_LABEL[c.estado] || c.estado}
                      </span>
                    </td>
                    <td className="col-acciones col-acciones--ancha" onClick={(e) => e.stopPropagation()}>
                      <div className="acciones-iconos">
                        <button type="button" className="btn-secondary icon-btn" title="Ver detalle" aria-label="Ver detalle" onClick={() => navigate(`/contratacion-publica/contratos/${c.id}`)}>
                          <Eye size={16} />
                        </button>
                        {canEdit && (
                          <>
                            <button type="button" className="btn-secondary icon-btn" title="Editar" aria-label="Editar" onClick={() => navigate(`/contratacion-publica/contratos/${c.id}/editar`)}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar" onClick={() => setPendingDeleteId(c.id)}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingDeleteId != null && (
        <ConfirmDialog
          title="Eliminar contrato"
          message="¿Eliminar este contrato? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
