import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../../services/auth.service';
import { getMyTasks } from '../../services/task.service';
import { getProjects } from '../../services/project.service';
import type { Task } from '../../types/task';
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS } from '../../types/task';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'TODO', label: 'Por hacer' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'IN_REVIEW', label: 'En revisión' },
  { value: 'DONE', label: 'Completado' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('IN_PROGRESS');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [projectFilter, setProjectFilter] = useState<number | ''>('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    getProjects({ page: 1 }).then((res) => {
      setProjects(res.data.map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getMyTasks({
      status: statusFilter || undefined,
      assignedToMe: assignedToMe || undefined,
      projectId: projectFilter !== '' ? Number(projectFilter) : undefined,
    }).then(setTasks).finally(() => setLoading(false));
  }, [statusFilter, assignedToMe, projectFilter]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>Bienvenido{user ? `, ${user.fullName}` : ''}</h1>
          <p className="hero-text">
            Gestiona proyectos, tareas y el equipo de trabajo desde un solo lugar.
          </p>
        </div>
      </header>

      <main className="page-container">
        <div className="page-header-row">
          <div>
            <p className="page-eyebrow">TAREAS</p>
            <h1>Mis tareas</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="filter-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <button
              className={`filter-btn ${assignedToMe ? 'active' : ''}`}
              onClick={() => setAssignedToMe(!assignedToMe)}
            >
              Asignadas a mí
            </button>
          </div>
        </div>

        <div className="dashboard-status-filters">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`filter-btn ${statusFilter === opt.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="admin-section">
          {loading ? (
            <div className="loading-state">Cargando tareas...</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">No hay tareas que mostrar con estos filtros.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Asignados</th>
                    <th>Horas est.</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="tasks-table-row"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="tasks-table-title">
                        <span className="tools-name">{task.title}</span>
                      </td>
                      <td>
                        <span className="project-name-chip" onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projects/${task.projectId}`);
                        }}>
                          {(task as any).project?.name || `Proyecto #${task.projectId}`}
                        </span>
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ backgroundColor: STATUS_COLORS[task.status] + '22', color: STATUS_COLORS[task.status] }}
                        >
                          {STATUS_LABELS[task.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className="priority-dot"
                          style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                          title={PRIORITY_LABELS[task.priority]}
                        />
                        {' '}{PRIORITY_LABELS[task.priority]}
                      </td>
                      <td>
                        <div className="tasks-table-assignees">
                          {task.assignees?.slice(0, 3).map((a: any) => (
                            <span key={a.user.id} className="tasks-table-assignee-item">
                              <span className="kanban-avatar">{a.user.fullName.charAt(0)}</span>
                            </span>
                          ))}
                          {task.assignees?.length > 3 && (
                            <span className="tasks-table-assignee-item">+{task.assignees.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td>{task.estimatedHours ? `${task.estimatedHours}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
