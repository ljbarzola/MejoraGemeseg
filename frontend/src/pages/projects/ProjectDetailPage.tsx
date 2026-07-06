import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, addMember, removeMember, updateMemberRole } from '../../services/project.service';
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
  MANAGER: 'Gerente',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const MEMBER_ROLE_OPTIONS = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];

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
  const currentUser = getUser();

  const userMembership = project?.members?.find(
    (m: any) => m.user.email === currentUser?.email,
  );
  const isViewer = userMembership?.role === 'VIEWER';
  const isOwner = userMembership?.role === 'OWNER' || currentUser?.role === 'ADMIN';

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
          <span
            className="status-badge status-badge-lg"
            style={{
              backgroundColor: PROJECT_STATUS_COLORS[project.status] + '20',
              color: PROJECT_STATUS_COLORS[project.status],
            }}
          >
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
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
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.user.id, e.target.value)}
                          style={{
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {MEMBER_ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        MEMBER_ROLE_LABELS[m.role] || m.role
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
                    <th>Fecha límite</th>
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
                        {task.assignee ? (
                          <>
                            <span className="kanban-avatar">
                              {task.assignee.fullName.charAt(0)}
                            </span>
                            {task.assignee.fullName}
                          </>
                        ) : (
                          <span className="kanban-unassigned">Sin asignar</span>
                        )}
                      </td>
                      <td className="tasks-table-date">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString('es-EC')
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
    </div>
  );
}
