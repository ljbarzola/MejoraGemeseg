import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProjectTasks, getProject } from '../../services/task.service';
import type { Task, TaskGrouped } from '../../types/task';
import { getUser } from '../../services/auth.service';

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

export default function KanbanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [grouped, setGrouped] = useState<TaskGrouped>({ TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] });
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const user = getUser();
  const canCreate = user && project?.members?.some(
    (m: any) => m.user.id === user.id && m.role !== 'VIEWER',
  );

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
        </div>
        {canCreate && (
          <button className="auth-btn" onClick={() => navigate(`/projects/${id}/tasks/new`)}>
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
