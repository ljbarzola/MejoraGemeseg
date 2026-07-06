import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProjectTasks, getProject } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task, TaskGrouped } from '../../types/task';

const COLUMNS: { key: keyof TaskGrouped; label: string; color: string }[] = [
  { key: 'TODO', label: 'Por Hacer', color: '#6b7280' },
  { key: 'IN_PROGRESS', label: 'En Progreso', color: '#3b82f6' },
  { key: 'IN_REVIEW', label: 'En Revisión', color: '#f59e0b' },
  { key: 'DONE', label: 'Completado', color: '#22c55e' },
];

const PRIORITY_BADGES: Record<string, { bg: string; fg: string }> = {
  LOW: { bg: '#f0fdf4', fg: '#16a34a' },
  MEDIUM: { bg: '#eff6ff', fg: '#2563eb' },
  HIGH: { bg: '#fef3c7', fg: '#d97706' },
  URGENT: { bg: '#fef2f2', fg: '#dc2626' },
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

export default function KanbanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [grouped, setGrouped] = useState<TaskGrouped>({ TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] });
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const user = getUser();
  const myMembership = project?.members?.find(
    (m: any) => m.user.id === user?.id,
  );
  const myRole = myMembership?.role;
  const canCreate = myRole && myRole !== 'VIEWER';

  useEffect(() => {
    if (!id) return;
    const pid = Number(id);
    Promise.all([getProjectTasks(pid), getProject(pid)])
      .then(([taskData, projData]) => {
        setGrouped(taskData.grouped);
        setProject(projData);
      })
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <div className="loading-state">Cargando tablero...</div>;
  if (!project) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate(`/projects/${id}`)}>
        &larr; Volver al proyecto
      </button>

      <div className="page-header-row">
        <div>
          <div className="page-eyebrow">Tablero Kanban</div>
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
        {canCreate ? (
          <button className="auth-btn" onClick={() => navigate(`/projects/${id}/tasks/new`)}>
            + Nueva Tarea
          </button>
        ) : (
          <button className="btn-disabled" disabled title="Solo los miembros con permisos pueden crear tareas">
            + Nueva Tarea
          </button>
        )}
      </div>

      <div className="kanban-board">
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-column">
            <div className="kanban-column-header">
              <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
              <span>{col.label}</span>
              <span className="kanban-column-count">{grouped[col.key].length}</span>
            </div>
            <div className="kanban-column-body">
              {grouped[col.key].map((task: Task) => (
                <div
                  key={task.id}
                  className="kanban-card"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <div className="kanban-card-header">
                    <span className="kanban-card-id">#{task.id}</span>
                    <span
                      className="kanban-priority"
                      style={{
                        backgroundColor: PRIORITY_BADGES[task.priority]?.bg,
                        color: PRIORITY_BADGES[task.priority]?.fg,
                      }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div className="kanban-card-title">{task.title}</div>
                  {task.assignee && (
                    <div className="kanban-card-assignee">
                      <div className="kanban-avatar">{task.assignee.fullName.charAt(0)}</div>
                      <span>{task.assignee.fullName}</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className="kanban-card-date">
                      {new Date(task.dueDate).toLocaleDateString('es-EC')}
                    </div>
                  )}
                </div>
              ))}
              {grouped[col.key].length === 0 && (
                <div className="kanban-empty">Sin tareas</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
