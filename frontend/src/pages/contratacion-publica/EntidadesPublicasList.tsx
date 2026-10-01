import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Building2 } from 'lucide-react';
import {
  getEntidadesPublicas,
  createEntidadPublica,
  updateEntidadPublica,
  deleteEntidadPublica,
} from '../../services/contratacion-publica.service';
import type { CPEntidadPublica } from '../../types/contratacion-publica';
import { usePerm } from '../../contexts/PermissionsContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';

export default function EntidadesPublicasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-entidades');

  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CPEntidadPublica | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formRuc, setFormRuc] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPEntidadPublica | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    getEntidadesPublicas()
      .then(setEntidades)
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar las entidades públicas.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = entidades.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.nombre.toLowerCase().includes(q) || (e.ruc || '').toLowerCase().includes(q);
  });

  const { filas, thProps, SortIcon } = useSortableTable(
    filtered,
    {
      nombre: (e) => e.nombre,
      ruc: (e) => e.ruc,
      direccion: (e) => e.direccion,
    },
    'nombre',
  );

  const resetForm = () => {
    setFormNombre('');
    setFormRuc('');
    setFormDireccion('');
    setFormError('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (e: CPEntidadPublica) => {
    setEditing(e);
    setFormNombre(e.nombre);
    setFormRuc(e.ruc || '');
    setFormDireccion(e.direccion || '');
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formNombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        nombre: formNombre.trim(),
        ruc: formRuc.trim() || undefined,
        direccion: formDireccion.trim() || undefined,
      };
      if (editing) {
        await updateEntidadPublica(editing.id, payload);
      } else {
        await createEntidadPublica(payload);
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'No se pudo guardar la entidad.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    const e = confirmandoEliminar;
    if (!e) return;
    setConfirmandoEliminar(null);
    try {
      await deleteEntidadPublica(e.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar la entidad.');
    }
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
            <h1>Entidades Públicas</h1>
          </div>
          <div className="header-actions">
            {canEdit && (
              <button className="auth-btn" onClick={openCreate}>
                <Plus size={16} /> Nueva Entidad
              </button>
            )}
          </div>
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
            placeholder="Buscar por nombre o RUC..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => setSearch('')} disabled={!search} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando entidades públicas...</div>
        ) : filas.length === 0 ? (
          <div className="empty-state">
            {entidades.length === 0 ? (
              <>No hay entidades públicas creadas. Haz clic en <strong>"+ Nueva Entidad"</strong> para registrar la primera.</>
            ) : (
              'No hay entidades que coincidan con la búsqueda.'
            )}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')}>Nombre <SortIcon campo="nombre" /></th>
                  <th {...thProps('ruc')}>RUC <SortIcon campo="ruc" /></th>
                  <th {...thProps('direccion')}>Dirección <SortIcon campo="direccion" /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/contratacion-publica/entidades/${e.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                      <span className="truncate">
                        <Building2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {e.nombre}
                      </span>
                    </td>
                    <td><span className="truncate">{e.ruc || '—'}</span></td>
                    <td><span className="truncate">{e.direccion || '—'}</span></td>
                    <td style={{ textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                      {canEdit && (
                        <RowActionsMenu
                          actions={[
                            { label: 'Editar', icon: <Pencil size={14} />, onClick: () => openEdit(e) },
                            { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmandoEliminar(e) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar Entidad Pública' : 'Nueva Entidad Pública'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="form-error">{formError}</div>}
                <div className="form-group">
                  <label>Nombre *</label>
                  <input type="text" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} placeholder="Ej: Municipio de Guayaquil" required />
                </div>
                <div className="form-group">
                  <label>RUC</label>
                  <input type="text" value={formRuc} onChange={(e) => setFormRuc(e.target.value)} placeholder="Ej: 0960000000001" />
                </div>
                <div className="form-group">
                  <label>Dirección</label>
                  <input type="text" value={formDireccion} onChange={(e) => setFormDireccion(e.target.value)} placeholder="Dirección de la entidad" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Entidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar entidad pública"
          message={`¿Eliminar la entidad "${confirmandoEliminar.nombre}"? Esto falla si tiene contratos asociados.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
