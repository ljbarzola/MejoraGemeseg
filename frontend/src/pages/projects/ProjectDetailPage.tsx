import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, addMember, removeMember, updateMemberRole, updateProject, deleteProject } from '../../services/project.service';
import { getTasksByProject } from '../../services/task.service';
import { getUsers } from '../../services/user.service';
import { getUser } from '../../services/auth.service';
import type { Task } from '../../types/task';
import type { AdminUser } from '../../services/user.service';
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, STATUS_COLORS } from '../../types/task';

const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  ON_HOLD: '#f59e0b',
  COMPLETED: '#3b82f6',
  CANCELLED: '#ef4444',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const MEMBER_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const MEMBER_ROLE_OPTIONS = ['OWNER', 'MEMBER', 'VIEWER'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', startDate: '', endDate: '', status: 'ACTIVE' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [openRoleMenu, setOpenRoleMenu] = useState<number | null>(null);
  const currentUser = getUser();

  const userMembership = project?.members?.find(
    (m: any) => m.user.email === currentUser?.email,
  );
  const isViewer = userMembership?.role === 'VIEWER';
  const isOwner = userMembership?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const canEditStatus = isOwner || userMembership?.role === 'MEMBER';

  const loadData = () => {
    if (!id) return;
    Promise.all([
      getProject(Number(id)),
      getTasksByProject(Number(id)),
    ])
      .then(([p, t]) => {
        setProject(p);
        setTasks(t);
      })
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id, navigate]);

  useEffect(() => {
    if (showAddModal && allUsers.length === 0) {
      getUsers().then(setAllUsers).catch(() => {});
    }
  }, [showAddModal]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest?.('.role-dropdown-container')) return;
      setOpenRoleMenu(null);
    }
    if (openRoleMenu !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openRoleMenu]);

  const currentMemberIds = project?.members?.map((m: any) => m.user.id) || [];
  const availableUsers = allUsers.filter(
    (u) => !currentMemberIds.includes(u.id) && u.isActive !== false,
  );

  async function handleAddMember() {
    if (!selectedUserId || !id) return;
    setAddLoading(true);
    setAddError('');
    try {
      await addMember(Number(id), selectedUserId, selectedRole);
      const p = await getProject(Number(id));
      setProject(p);
      setShowAddModal(false);
      setSelectedUserId(null);
      setSelectedRole('MEMBER');
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Error al agregar miembro');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveMember(targetUserId: number) {
    if (!id) return;
    if (!confirm('¿Estás seguro de eliminar este miembro del proyecto?')) return;
    try {
      await removeMember(Number(id), targetUserId);
      const p = await getProject(Number(id));
      setProject(p);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar miembro');
    }
  }

  async function handleChangeRole(targetUserId: number, newRole: string) {
    if (!id) return;
    try {
      await updateMemberRole(Number(id), targetUserId, newRole);
      const p = await getProject(Number(id));
      setProject(p);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al cambiar rol');
    }
  }

  function openEditModal() {
    setEditForm({
      name: project.name || '',
      description: project.description || '',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      status: project.status || 'ACTIVE',
    });
    setEditError('');
    setShowEditModal(true);
  }

  async function handleUpdateProject() {
    if (!id || !editForm.name.trim()) return;
    setEditLoading(true);
    setEditError('');
    try {
      await updateProject(Number(id), {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        startDate: editForm.startDate || undefined,
        endDate: editForm.endDate || undefined,
        status: editForm.status,
      });
      const p = await getProject(Number(id));
      setProject(p);
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Error al actualizar proyecto');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteProject() {
    if (!id) return;
    if (!confirm('¿Estás seguro de eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteProject(Number(id));
      navigate('/projects');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar proyecto');
    }
  }

  if (loading) return <div className="loading-state">Cargando proyecto...</div>;
  if (!project) return null;

  const visibleMembers = project.members.filter((m: any) => {
    if (currentUser?.role === 'ADMIN') return true;
    return m.user.email !== 'admin@gemeseg.com';
  });

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/projects')}>
        &larr; Volver a proyectos
      </button>

      <div className="project-detail">
        <div className="project-detail-header">
          <h1>{project.name}</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              className="status-badge status-badge-lg"
              style={{
                backgroundColor: PROJECT_STATUS_COLORS[project.status] + '20',
                color: PROJECT_STATUS_COLORS[project.status],
              }}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            {canEditStatus && (
              <button className="btn-secondary" onClick={openEditModal}>
                Editar
              </button>
            )}
            {isOwner && (
              <button className="btn-delete-project" onClick={handleDeleteProject} title="Eliminar proyecto">
                Eliminar proyecto
              </button>
            )}
          </div>
        </div>

        {project.description && (
          <p className="project-detail-desc">{project.description}</p>
        )}

        <div className="project-detail-meta">
          <div className="meta-item">
            <span className="meta-label">Creado por</span>
            <span className="meta-value">{project.createdBy.fullName}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de inicio</span>
            <span className="meta-value">
              {project.startDate
                ? new Date(project.startDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de fin</span>
            <span className="meta-value">
              {project.endDate
                ? new Date(project.endDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Tareas</span>
            <span className="meta-value">{tasks.length}</span>
          </div>
        </div>

        <div className="project-members">
          <div className="tasks-section-header">
            <h2>Miembros ({visibleMembers.length})</h2>
            {isOwner && (
              <button className="auth-btn" onClick={() => setShowAddModal(true)}>
                + Agregar miembro
              </button>
            )}
          </div>
          <div className="members-list">
            {visibleMembers.map((m: any) => {
              const isCurrentUser = m.user.email === currentUser?.email;
              const canManage = isOwner && !isCurrentUser;
              const canChangeRole = currentUser?.role === 'ADMIN' && !isCurrentUser;
              return (
                <div key={m.id} className="member-item">
                  <div className="member-avatar">
                    {m.user.fullName.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="member-name">
                      {m.user.fullName}
                      {isCurrentUser && (
                        <span className="member-you-badge">(Tú)</span>
                      )}
                    </div>
                    <div className="member-role">
                      {canChangeRole ? (
                        <div className="role-dropdown-container">
                          <span
                            className={`role-badge role-dropdown-trigger role-badge-${m.role.toLowerCase()}`}
                            onClick={() => setOpenRoleMenu(openRoleMenu === m.user.id ? null : m.user.id)}
                          >
                            {MEMBER_ROLE_LABELS[m.role]} ▾
                          </span>
                          {openRoleMenu === m.user.id && (
                            <div className="role-dropdown-menu">
                              {MEMBER_ROLE_OPTIONS.map((r) => (
                                <button
                                  key={r}
                                  className={`role-dropdown-option role-dropdown-option-${r.toLowerCase()} ${r === m.role ? 'active' : ''}`}
                                  onClick={() => { handleChangeRole(m.user.id, r); setOpenRoleMenu(null); }}
                                >
                                  {r === m.role && <span className="role-dropdown-check">✓</span>}
                                  {MEMBER_ROLE_LABELS[r]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className={`role-badge role-badge-${m.role.toLowerCase()}`}>
                          {MEMBER_ROLE_LABELS[m.role] || m.role}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      className="btn-danger-sm"
                      onClick={() => handleRemoveMember(m.user.id)}
                      title="Eliminar miembro"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="tasks-section">
          <div className="tasks-section-header">
            <h2>Tareas ({tasks.length})</h2>
            <div className="tasks-section-actions">
              <button
                className="btn-secondary"
                onClick={() => navigate(`/projects/${project.id}/tasks`)}
              >
                Ver tablero Kanban
              </button>
              <button
                className={`auth-btn ${isViewer ? 'btn-disabled' : ''}`}
                onClick={() => {
                  if (!isViewer) navigate(`/projects/${project.id}/tasks/new`);
                }}
                disabled={isViewer}
                title={isViewer ? 'Los observadores no pueden crear tareas' : ''}
              >
                + Nueva tarea
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <p>No hay tareas en este proyecto</p>
            </div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Asignado</th>
                    <th>Fecha fin</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="tasks-table-row"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <td className="tasks-table-id">{task.id}</td>
                      <td className="tasks-table-title">{task.title}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: STATUS_COLORS[task.status] + '20',
                            color: STATUS_COLORS[task.status],
                          }}
                        >
                          {STATUS_LABELS[task.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className="kanban-priority"
                          style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </td>
                      <td className="tasks-table-assignee">
                        {task.assignees.length > 0 ? (
                          <div className="tasks-table-assignees">
                            {task.assignees.map((a) => (
                              <span key={a.user.id} className="tasks-table-assignee-item">
                                <span className="kanban-avatar">
                                  {a.user.fullName.charAt(0)}
                                </span>
                                {a.user.fullName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="kanban-unassigned">Sin asignar</span>
                        )}
                      </td>
                      <td className="tasks-table-date">
                        {task.endDate
                          ? new Date(task.endDate).toLocaleDateString('es-EC')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar miembro al proyecto</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {addError && <div className="form-error">{addError}</div>}
              <div className="form-group">
                <label>Usuario</label>
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                >
                  <option value="">Seleccionar usuario...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Rol en el proyecto</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {MEMBER_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancelar
              </button>
              <button
                className="auth-btn"
                onClick={handleAddMember}
                disabled={!selectedUserId || addLoading}
              >
                {addLoading ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar proyecto</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {editError && <div className="form-error">{editError}</div>}
              <div className="form-group">
                <label>Nombre del proyecto</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Ej: Landings Q3"
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  className="form-textarea"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  placeholder="Describe el objetivo del proyecto..."
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha de inicio</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Fecha de fin</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="ON_HOLD">En pausa</option>
                  <option value="COMPLETED">Completado</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancelar
              </button>
              <button
                className="auth-btn"
                onClick={handleUpdateProject}
                disabled={!editForm.name.trim() || editLoading}
              >
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
