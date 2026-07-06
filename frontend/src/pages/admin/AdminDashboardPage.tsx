import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUsers,
  getUserStats,
  getProjectStats,
  createUser,
  updateUser,
  deleteUser,
} from '../../services/user.service';
import { getProjects } from '../../services/project.service';
import type { AdminUser, UserStats, AdminProjectStats } from '../../services/user.service';
import type { Project } from '../../types/project';
import { getUser } from '../../services/auth.service';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'EMPLOYEE' as string,
    documentNumber: '',
    position: '',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

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
      const [usersData, statsData, projStats, projectsData] = await Promise.all([
        getUsers(),
        getUserStats(),
        getProjectStats(),
        getProjects(),
      ]);
      setUsers(usersData);
      setUserStats(statsData);
      setProjectStats(projStats);
      setAllProjects(projectsData.data);
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
    return true;
  });

  const openCreateForm = () => {
    setEditingUser(null);
    setFormData({
      fullName: '',
      email: '',
      password: 'gemeseg2026',
      role: 'EMPLOYEE',
      documentNumber: '',
      position: '',
    });
    setFormError('');
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
    });
    setFormError('');
    setShowForm(true);
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
        };
        await updateUser(editingUser.id, data);
      } else {
        await createUser({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password || 'gemeseg2026',
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

  const handleDelete = async (userId: number, userName: string) => {
    if (!confirm(`¿Desactivar usuario "${userName}"?`)) return;
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
          <div className="admin-toolbar">
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
              className="admin-filter-select"
            >
              <option value="">Todos los roles</option>
              <option value="ADMIN">Administrador</option>
              <option value="MANAGER">Gerente</option>
              <option value="EMPLOYEE">Empleado</option>
            </select>
            <button className="auth-btn" onClick={openCreateForm}>
              + Nuevo usuario
            </button>
          </div>

          {loading ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol sistema</th>
                    <th>Cargo</th>
                    <th>Estado</th>
                    <th>Proyectos</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="tasks-table-row">
                      <td className="tasks-table-title">{u.fullName}</td>
                      <td>{u.email}</td>
                      <td>
                        <span
                          className="kanban-priority"
                          style={{ backgroundColor: ROLE_COLORS[u.role] }}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>{u.position || '—'}</td>
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
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-icon"
                            onClick={() => openEditForm(u)}
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => handleToggleActive(u)}
                            title={u.isActive ? 'Desactivar' : 'Activar'}
                          >
                            {u.isActive ? '🔒' : '🔓'}
                          </button>
                          {u.role !== 'ADMIN' && (
                            <button
                              className="btn-icon btn-icon-danger"
                              onClick={() => handleDelete(u.id, u.fullName)}
                              title="Eliminar"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h2>
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
                  <label>Contraseña</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="gemeseg2026"
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
              <div className="form-actions">
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
      )}
    </div>
  );
}
