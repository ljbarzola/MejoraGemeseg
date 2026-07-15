import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

type SortField = 'title' | 'project' | 'status' | 'priority' | 'assignees' | 'estimatedHours';
type SortDirection = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const STATUS_ORDER: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  IN_REVIEW: 2,
  DONE: 3,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem('dashboard_status_filter') || 'IN_PROGRESS'
  );
  const [assignedToMe, setAssignedToMe] = useState(
    () => localStorage.getItem('dashboard_assigned_to_me') === 'true'
  );
  const [projectFilter, setProjectFilter] = useState<number | ''>(
    () => {
      const saved = localStorage.getItem('dashboard_project_filter');
      return saved !== null ? (saved === '' ? '' : Number(saved)) : '';
    }
  );
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
  }, [statusFilter, assignedToMe, projectFilter, location.key]);

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'project': {
          const nameA = (a as any).project?.name || '';
          const nameB = (b as any).project?.name || '';
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case 'priority':
          cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case 'assignees':
          cmp = (a.assignees?.length || 0) - (b.assignees?.length || 0);
          break;
        case 'estimatedHours':
          cmp = (a.estimatedHours || 0) - (b.estimatedHours || 0);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [tasks, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon sort-active">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

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
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : '';
                setProjectFilter(val);
                localStorage.setItem('dashboard_project_filter', String(val));
              }}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <button
              className={`filter-btn ${assignedToMe ? 'active' : ''}`}
              onClick={() => {
                const next = !assignedToMe;
                setAssignedToMe(next);
                localStorage.setItem('dashboard_assigned_to_me', String(next));
              }}
            >
              Asignadas a mí
            </button>

            <button
              className="auth-btn"
              onClick={() => navigate('/tasks/new')}
              style={{ marginLeft: 4 }}
            >
              + Nueva tarea
            </button>
          </div>
        </div>

        <div className="dashboard-status-filters">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`filter-btn ${statusFilter === opt.value ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter(opt.value);
                localStorage.setItem('dashboard_status_filter', opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="admin-section">
          {loading ? (
            <div className="loading-state">Cargando tareas...</div>
          ) : sortedTasks.length === 0 ? (
            <div className="empty-state">No hay tareas que mostrar con estos filtros.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th className="sortable-th" onClick={() => handleSort('title')}>
                      Tarea <SortIcon field="title" />
                    </th>
                    <th className="sortable-th" onClick={() => handleSort('project')}>
                      Proyecto <SortIcon field="project" />
                    </th>
                    <th className="sortable-th" onClick={() => handleSort('status')}>
                      Estado <SortIcon field="status" />
                    </th>
                    <th className="sortable-th" onClick={() => handleSort('priority')}>
                      Prioridad <SortIcon field="priority" />
                    </th>
                    <th className="sortable-th" onClick={() => handleSort('assignees')}>
                      Asignados <SortIcon field="assignees" />
                    </th>
                    <th className="sortable-th" onClick={() => handleSort('estimatedHours')}>
                      Horas est. <SortIcon field="estimatedHours" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => (
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
