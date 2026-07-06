import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject } from '../../services/project.service';
import { getProjectTasks } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task } from '../../types/task';

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

const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: '#6b7280',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#f59e0b',
  DONE: '#22c55e',
  CANCELLED: '#ef4444',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'Por Hacer',
  IN_PROGRESS: 'En Progreso',
  IN_REVIEW: 'En Revisión',
  DONE: 'Completado',
  CANCELLED: 'Cancelado',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#16a34a',
  MEDIUM: '#2563eb',
  HIGH: '#d97706',
  URGENT: '#dc2626',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  MANAGER: 'Gerente',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: '#dc2626',
  MANAGER: '#2563eb',
  MEMBER: '#16a34a',
  VIEWER: '#6b7280',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = getUser();

  const userMembership = project?.members?.find(
    (m: any) => m.user.email === currentUser?.email,
  );
  const isViewer = userMembership?.role === 'VIEWER';

  const currentUser = getUser();

  const myMembership = project?.members?.find(
    (m: any) => m.user.id === currentUser?.id,
  );
  const myRole = myMembership?.role;
  const canEdit = myRole && myRole !== 'VIEWER';

  useEffect(() => {
    if (id) {
      const pid = Number(id);
      Promise.all([getProject(pid), getProjectTasks(pid)])
        .then(([proj, taskData]) => {
          setProject(proj);
          setTasks(taskData.tasks);
        })
        .catch(() => navigate('/projects'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  if (loading) return <div className="loading-state">Cargando proyecto...</div>;
  if (!project) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/projects')}>
        &larr; Volver a proyectos
      </button>

      <div className="project-detail">
        <div className="project-detail-header">
          <div>
            <div className="page-eyebrow">Detalle del Proyecto</div>
            <h1>{project.name}</h1>
            {myRole && (
              <span
                className="status-badge my-role-badge"
                style={{
                  backgroundColor: ROLE_COLORS[myRole] + '20',
                  color: ROLE_COLORS[myRole],
                }}
              >
                Mi rol: {ROLE_LABELS[myRole]}
              </span>
            )}
          </div>
          <div className="project-detail-header-actions">
            <span
              className="status-badge status-badge-lg"
              style={{
                backgroundColor: STATUS_COLORS[project.status] + '20',
                color: STATUS_COLORS[project.status],
              }}
            >
              {STATUS_LABELS[project.status]}
            </span>
            <button className="auth-btn" onClick={() => navigate(`/projects/${id}/board`)}>
              Ver tablero Kanban
            </button>
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
          <h2>Miembros ({project.members.length})</h2>
          <div className="members-list">
            {project.members.map((m: any) => {
              const isMe = m.user.id === currentUser?.id;
              return (
                <div key={m.id} className={`member-item ${isMe ? 'member-item-me' : ''}`}>
                  <div className="member-avatar">
                    {m.user.fullName.charAt(0)}
                  </div>
                  <div>
                    <div className="member-name">
                      {m.user.fullName}
                      {isMe && <span className="member-me-tag"> (Tú)</span>}
                    </div>
                    <div className="member-role">
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: ROLE_COLORS[m.role] + '20',
                          color: ROLE_COLORS[m.role],
                          fontSize: '0.7rem',
                        }}
                      >
                        {ROLE_LABELS[m.role]}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {currentUser && !project.members.some((m: any) => m.user.id === currentUser.id) && (
              <div className="member-item member-item-me">
                <div className="member-avatar">
                  {currentUser.fullName.charAt(0)}
                </div>
                <div>
                  <div className="member-name">
                    {currentUser.fullName}
                    <span className="member-me-tag"> (Tú)</span>
                  </div>
                  <div className="member-role">
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: ROLE_COLORS['OWNER'] + '20',
                        color: ROLE_COLORS['OWNER'],
                        fontSize: '0.7rem',
                      }}
                    >
                      Administrador
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {currentUser && !userMembership && (
            <div className="member-item" style={{ marginTop: '8px', opacity: 0.7 }}>
              <div className="member-avatar">{currentUser.fullName.charAt(0)}</div>
              <div>
                <div className="member-name">{currentUser.fullName} (Tú)</div>
                <div className="member-role">{currentUser.role}</div>
              </div>
            )}
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

        <div className="project-tasks-section">
          <div className="project-tasks-header">
            <h2>Tareas del Proyecto ({tasks.length})</h2>
            {canEdit ? (
              <button
                className="auth-btn"
                onClick={() => navigate(`/projects/${id}/tasks/new`)}
              >
                + Nueva Tarea
              </button>
            ) : (
              <button className="btn-disabled" disabled title="Solo los miembros con permisos pueden crear tareas">
                + Nueva Tarea
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state">
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
                    <th>Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="tasks-table-row"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <td className="task-id-cell">{task.id}</td>
                      <td className="task-title-cell">{task.title}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: TASK_STATUS_COLORS[task.status] + '20',
                            color: TASK_STATUS_COLORS[task.status],
                          }}
                        >
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className="priority-badge"
                          style={{ color: PRIORITY_COLORS[task.priority] }}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td>
                        {task.assignee ? (
                          <div className="table-assignee">
                            <div className="kanban-avatar">{task.assignee.fullName.charAt(0)}</div>
                            <span>{task.assignee.fullName}</span>
                          </div>
                        ) : (
                          <span className="unassigned">Sin asignar</span>
                        )}
                      </td>
                      <td>
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString('es-EC')
                          : '-'}
                      </td>
                      <td>{task.estimatedHours ? `${task.estimatedHours}h` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
