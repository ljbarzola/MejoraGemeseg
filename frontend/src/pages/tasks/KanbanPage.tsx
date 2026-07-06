import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTasksByProject, getProject, updateTask } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task, TaskGrouped } from '../../types/task';
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, STATUS_COLORS } from '../../types/task';

const COLUMNS: (keyof TaskGrouped)[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const NEXT_STATUS: Record<string, string> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_REVIEW',
  IN_REVIEW: 'DONE',
};

export default function KanbanPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const currentUser = getUser();

  const isViewer = project?.members?.some(
    (m: any) => m.user.email === currentUser?.email && m.role === 'VIEWER',
  );

  const loadData = async () => {
    if (!projectId) return;
    try {
      const [tasksData, projectData] = await Promise.all([
        getTasksByProject(Number(projectId)),
        getProject(Number(projectId)),
      ]);
      setTasks(tasksData);
      setProject(projectData);
    } catch {
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId, navigate]);

  const grouped: TaskGrouped = {
    TODO: [],
    IN_PROGRESS: [],
    IN_REVIEW: [],
    DONE: [],
  };

  tasks.forEach((task) => {
    if (grouped[task.status as keyof TaskGrouped]) {
      grouped[task.status as keyof TaskGrouped].push(task);
    }
  });

  const handleAdvance = async (taskId: number, currentStatus: string) => {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;
    try {
      await updateTask(taskId, { status: next });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: next as Task['status'] } : t)),
      );
    } catch {
      // silent
    }
  };

  if (loading) return <div className="loading-state">Cargando tablero...</div>;
  if (!project) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate(`/projects/${projectId}`)}>
        &larr; Volver al proyecto
      </button>

      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Tablero Kanban</p>
          <h1>{project.name}</h1>
        </div>
        <button
          className={`auth-btn ${isViewer ? 'btn-disabled' : ''}`}
          onClick={() => {
            if (!isViewer) navigate(`/projects/${projectId}/tasks/new`);
          }}
          disabled={isViewer}
          title={isViewer ? 'Los observadores no pueden crear tareas' : ''}
        >
          + Nueva tarea
        </button>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((col) => (
          <div key={col} className="kanban-column">
            <div
              className="kanban-column-header"
              style={{ borderBottomColor: STATUS_COLORS[col] }}
            >
              <span className="kanban-column-title">{STATUS_LABELS[col]}</span>
              <span className="kanban-column-count">{grouped[col].length}</span>
            </div>
            <div className="kanban-cards">
              {grouped[col].map((task) => (
                <div
                  key={task.id}
                  className="kanban-card"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <div className="kanban-card-header">
                    <span
                      className="kanban-priority"
                      style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                    >
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    {task.dueDate && (
                      <span className="kanban-due">
                        {new Date(task.dueDate).toLocaleDateString('es-EC')}
                      </span>
                    )}
                  </div>
                  <h4 className="kanban-card-title">{task.title}</h4>
                  {task.description && (
                    <p className="kanban-card-desc">{task.description}</p>
                  )}
                  <div className="kanban-card-footer">
                    {task.assignee ? (
                      <span className="kanban-assignee">
                        <span className="kanban-avatar">
                          {task.assignee.fullName.charAt(0)}
                        </span>
                        {task.assignee.fullName}
                      </span>
                    ) : (
                      <span className="kanban-unassigned">Sin asignar</span>
                    )}
                    {NEXT_STATUS[task.status] && !isViewer && (
                      <button
                        className="kanban-advance-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdvance(task.id, task.status);
                        }}
                      >
                        →
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {grouped[col].length === 0 && (
                <div className="kanban-empty">Sin tareas</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
