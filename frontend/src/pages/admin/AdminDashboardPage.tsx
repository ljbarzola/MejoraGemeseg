import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUsers,
  getUserStats,
  getProjectStats,
  createUser,
  updateUser,
  deleteUser,
  getCompanyLocations,
  createCompanyLocation,
} from '../../services/user.service';
import { getProjects } from '../../services/project.service';
import type { AdminUser, UserStats, AdminProjectStats, CompanyLocation } from '../../services/user.service';
import type { Project } from '../../types/project';
import { getUser } from '../../services/auth.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';

const NUEVA_UBICACION = '__nueva__';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  EMPLOYEE: 'Empleado',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: '#ef4444',
  MANAGER: '#f59e0b',
  EMPLOYEE: '#3b82f6',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  ON_HOLD: '#f59e0b',
  COMPLETED: '#3b82f6',
  CANCELLED: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  TODO: 'Por hacer',
  IN_PROGRESS: 'En progreso',
  IN_REVIEW: 'En revisión',
  DONE: 'Completado',
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'users' | 'projects'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [projectStats, setProjectStats] = useState<AdminProjectStats | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [locations, setLocations] = useState<CompanyLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'EMPLOYEE' as string,
    documentNumber: '',
    position: '',
    locationId: null as number | null,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState<{ id: number; name: string } | null>(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [addLocationLoading, setAddLocationLoading] = useState(false);
  const tablaRef = useResizableColumns('admin-users');

  const currentUser = getUser();

  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, statsData, projStats, projectsData, locationsData] = await Promise.all([
        getUsers(),
        getUserStats(),
        getProjectStats(),
        getProjects(),
        getCompanyLocations().catch(() => []),
      ]);
      setUsers(usersData);
      setUserStats(statsData);
      setProjectStats(projStats);
      setAllProjects(projectsData.data);
      setLocations(locationsData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (roleFilter && u.role !== roleFilter) return false;
    if (locationFilter && String(u.locationId ?? '') !== locationFilter) return false;
    return true;
  });

  const hayFiltrosUsuarios = !!(search || roleFilter || locationFilter);
  const limpiarFiltrosUsuarios = () => {
    setSearch('');
    setRoleFilter('');
    setLocationFilter('');
  };

  const { filas: filasUsuarios, thProps, SortIcon } = useSortableTable(
    filteredUsers,
    {
      fullName: (u) => u.fullName,
      email: (u) => u.email,
      role: (u) => ROLE_LABELS[u.role] || u.role,
      position: (u) => u.position,
      location: (u) => u.location?.nombre,
      isActive: (u) => (u.isActive ? 1 : 0),
      proyectos: (u) => u._count.createdProjects + u._count.projectMemberships,
    },
    'fullName',
  );

  const openCreateForm = () => {
    setEditingUser(null);
    setFormData({
      fullName: '',
      email: '',
      password: '',
      role: 'EMPLOYEE',
      documentNumber: '',
      position: '',
      locationId: null,
    });
    setFormError('');
    setShowAddLocation(false);
    setNewLocationName('');
    setShowForm(true);
  };

  const openEditForm = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      password: '',
      role: user.role,
      documentNumber: user.documentNumber || '',
      position: user.position || '',
      locationId: user.location?.id ?? null,
    });
    setFormError('');
    setShowAddLocation(false);
    setNewLocationName('');
    setShowForm(true);
  };

  const handleLocationSelectChange = (value: string) => {
    if (value === NUEVA_UBICACION) {
      setShowAddLocation(true);
      return;
    }
    setFormData((prev) => ({ ...prev, locationId: value ? Number(value) : null }));
  };

  const handleAddLocation = async () => {
    const nombre = newLocationName.trim();
    if (!nombre) return;
    setAddLocationLoading(true);
    setFormError('');
    try {
      const created = await createCompanyLocation(nombre);
      setLocations((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setFormData((prev) => ({ ...prev, locationId: created.id }));
      setShowAddLocation(false);
      setNewLocationName('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'No se pudo crear la ubicación';
      setFormError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setAddLocationLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      if (editingUser) {
        const data: any = {
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
          documentNumber: formData.documentNumber || null,
          position: formData.position || null,
          locationId: formData.locationId,
        };
        await updateUser(editingUser.id, data);
      } else {
        if (!formData.password) {
          setFormError('La contraseña es requerida para nuevos usuarios');
          setFormLoading(false);
          return;
        }
        await createUser({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          documentNumber: formData.documentNumber || undefined,
          position: formData.position || undefined,
        });
      }
      setShowForm(false);
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al guardar';
      setFormError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (userId: number, userName: string) => {
    setConfirmandoDesactivar({ id: userId, name: userName });
  };

  const confirmarDesactivar = async () => {
    if (!confirmandoDesactivar) return;
    const { id: userId } = confirmandoDesactivar;
    setConfirmandoDesactivar(null);
    try {
      await deleteUser(userId);
      loadData();
    } catch {
      // silent
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      loadData();
    } catch {
      // silent
    }
  };

  if (currentUser?.role !== 'ADMIN') return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/dashboard')}>
        &larr; Volver al dashboard
      </button>

      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Panel de administración</p>
          <h1>Administración del sistema</h1>
        </div>
      </div>

      {userStats && projectStats && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span className="admin-stat-number">{userStats.active}</span>
            <span className="admin-stat-label">Usuarios activos</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-number">{userStats.inactive}</span>
            <span className="admin-stat-label">Usuarios inactivos</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-number">{projectStats.totalProjects}</span>
            <span className="admin-stat-label">Proyectos totales</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-number">{projectStats.tasks.completionRate}%</span>
            <span className="admin-stat-label">Tareas completadas</span>
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          Gestionar usuarios
        </button>
        <button
          className={`admin-tab ${tab === 'projects' ? 'active' : ''}`}
          onClick={() => setTab('projects')}
        >
          Panel de proyectos
        </button>
      </div>

      {tab === 'users' && (
        <div className="admin-section">
          <div className="filter-bar">
            <div className="filter-bar-fields">
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-search"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">Todos los roles</option>
                <option value="ADMIN">Administrador</option>
                <option value="MANAGER">Gerente</option>
                <option value="EMPLOYEE">Empleado</option>
              </select>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">Todas las ubicaciones</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={limpiarFiltrosUsuarios} disabled={!hayFiltrosUsuarios} />
              <button className="auth-btn" onClick={openCreateForm}>
                + Nuevo usuario
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef}>
                <thead>
                  <tr>
                    <th {...thProps('fullName')}>Nombre <SortIcon campo="fullName" /></th>
                    <th {...thProps('email')}>Email <SortIcon campo="email" /></th>
                    <th {...thProps('role')}>Rol sistema <SortIcon campo="role" /></th>
                    <th {...thProps('position')}>Cargo <SortIcon campo="position" /></th>
                    <th {...thProps('location')}>Ubicación <SortIcon campo="location" /></th>
                    <th {...thProps('isActive')}>Estado <SortIcon campo="isActive" /></th>
                    <th {...thProps('proyectos')}>Proyectos <SortIcon campo="proyectos" /></th>
                    <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filasUsuarios.map((u) => (
                    <tr key={u.id} className="tasks-table-row">
                      <td className="tasks-table-title">{u.fullName}</td>
                      <td><span className="truncate">{u.email}</span></td>
                      <td>
                        <span
                          className="kanban-priority"
                          style={{ backgroundColor: ROLE_COLORS[u.role] }}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>{u.position || '—'}</td>
                      <td>{u.location?.nombre || '—'}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: u.isActive ? '#dcfce7' : '#fee2e2',
                            color: u.isActive ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {u.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>{u._count.createdProjects + u._count.projectMemberships}</td>
                      <td className="col-acciones">
                        <RowActionsMenu
                          actions={[
                            { label: 'Editar', onClick: () => openEditForm(u) },
                            {
                              label: u.isActive ? 'Desactivar' : 'Activar',
                              onClick: () => handleToggleActive(u),
                            },
                            ...(u.role !== 'ADMIN'
                              ? [{ label: 'Eliminar', danger: true, onClick: () => handleDelete(u.id, u.fullName) }]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filasUsuarios.length === 0 && (
                <div className="empty-state">No se encontraron usuarios</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'projects' && projectStats && (
        <div className="admin-section">
          <div className="admin-project-health">
            <h3>Salud global de proyectos</h3>
            <div className="admin-health-grid">
              {projectStats.byStatus.map((s) => (
                <div key={s.status} className="admin-health-card">
                  <div
                    className="admin-health-indicator"
                    style={{ backgroundColor: STATUS_COLORS[s.status] }}
                  />
                  <div>
                    <span className="admin-health-count">{s.count}</span>
                    <span className="admin-health-label">{STATUS_LABELS[s.status] || s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-project-health" style={{ marginTop: '24px' }}>
            <h3>Resumen de tareas</h3>
            <div className="admin-health-grid">
              {projectStats.tasks.byStatus.map((s) => (
                <div key={s.status} className="admin-health-card">
                  <div
                    className="admin-health-indicator"
                    style={{ backgroundColor: STATUS_COLORS[s.status] || '#6b7280' }}
                  />
                  <div>
                    <span className="admin-health-count">{s.count}</span>
                    <span className="admin-health-label">{STATUS_LABELS[s.status] || s.status}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="admin-completion-bar">
              <div className="admin-completion-track">
                <div
                  className="admin-completion-fill"
                  style={{ width: `${projectStats.tasks.completionRate}%` }}
                />
              </div>
              <span className="admin-completion-text">
                {projectStats.tasks.completionRate}% completado ({projectStats.tasks.completed}/{projectStats.tasks.total})
              </span>
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <button className="auth-btn" onClick={() => navigate('/projects')}>
              Ver todos los proyectos
            </button>
          </div>

          <div className="admin-project-health" style={{ marginTop: '24px' }}>
            <h3>Listado de proyectos</h3>
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Creado por</th>
                    <th>Tareas</th>
                    <th>Miembros</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {allProjects.map((p) => (
                    <tr key={p.id} className="tasks-table-row">
                      <td className="tasks-table-title">{p.name}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: STATUS_COLORS[p.status] + '20',
                            color: STATUS_COLORS[p.status],
                          }}
                        >
                          {STATUS_LABELS[p.status]}
                        </span>
                      </td>
                      <td>{p.createdBy.fullName}</td>
                      <td>{p._count.tasks}</td>
                      <td>{p._count.members}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label>Nombre completo *</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                {!editingUser && (
                  <div className="form-group">
                    <label>Contraseña *</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Ingresa una contraseña"
                      required
                    />
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Rol *</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="ADMIN">Administrador</option>
                      <option value="MANAGER">Gerente</option>
                      <option value="EMPLOYEE">Empleado</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cargo</label>
                    <input
                      type="text"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Ej: Analista"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Documento de identidad</label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  />
                </div>
                {editingUser && (
                  <div className="form-group">
                    <label>Ubicación</label>
                    <select
                      value={showAddLocation ? NUEVA_UBICACION : (formData.locationId ?? '')}
                      onChange={(e) => handleLocationSelectChange(e.target.value)}
                    >
                      <option value="">Sin ubicación</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.nombre}</option>
                      ))}
                      <option value={NUEVA_UBICACION}>+ Agregar nueva ubicación...</option>
                    </select>
                    {showAddLocation && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <input
                          type="text"
                          value={newLocationName}
                          onChange={(e) => setNewLocationName(e.target.value)}
                          placeholder="Nombre de la ubicación"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleAddLocation}
                          disabled={addLocationLoading || !newLocationName.trim()}
                        >
                          {addLocationLoading ? 'Guardando...' : 'Agregar'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => { setShowAddLocation(false); setNewLocationName(''); }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="modal-actions" style={{ padding: 0, borderTop: 'none' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="auth-btn" disabled={formLoading}>
                    {formLoading ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmandoDesactivar && (
        <ConfirmDialog
          title="Desactivar usuario"
          message={`¿Desactivar usuario "${confirmandoDesactivar.name}"?`}
          confirmLabel="Desactivar"
          danger
          onConfirm={confirmarDesactivar}
          onCancel={() => setConfirmandoDesactivar(null)}
        />
      )}
    </div>
  );
}
