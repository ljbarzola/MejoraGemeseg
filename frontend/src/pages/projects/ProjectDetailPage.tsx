import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject } from '../../services/project.service';
import { getTasksByProject } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task } from '../../types/task';
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

  useEffect(() => {
    if (id) {
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
          <h2>Miembros ({project.members.length})</h2>
          <div className="members-list">
            {project.members.map((m: any) => {
              const isCurrentUser = m.user.email === currentUser?.email;
              return (
                <div key={m.id} className="member-item">
                  <div className="member-avatar">
                    {m.user.fullName.charAt(0)}
                  </div>
                  <div>
                    <div className="member-name">
                      {m.user.fullName}
                      {isCurrentUser && (
                        <span className="member-you-badge">(Tú)</span>
                      )}
                    </div>
                    <div className="member-role">
                      {MEMBER_ROLE_LABELS[m.role] || m.role}
                    </div>
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
            </div>
          )}
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
    </div>
  );
}
