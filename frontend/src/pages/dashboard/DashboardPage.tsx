import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getUser } from '../../services/auth.service';
import { getMyTasks, updateTask } from '../../services/task.service';
import { getProjects } from '../../services/project.service';
import CreateTaskModal from '../../components/tasks/CreateTaskModal';
import TaskDetailModal from '../../components/tasks/TaskDetailModal';
import TaskStatusMenu from '../../components/tasks/TaskStatusMenu';
import PendingSurveysBanner from '../../components/personal/PendingSurveysBanner';
import ReferirClienteButton from '../../components/common/ReferirClienteButton';
import { UserCheck } from 'lucide-react';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';
import type { Task } from '../../types/task';
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, STATUS_ORDER, PRIORITY_ORDER } from '../../types/task';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'TODO', label: 'Por hacer' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'IN_REVIEW', label: 'En revisión' },
  { value: 'DONE', label: 'Completado' },
];

// Columnas elegibles de «Mis tareas» (además de «Tarea», que va siempre).
const COLUMNAS_TAREAS = [
  { key: 'status', label: 'Estado' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'project', label: 'Proyecto' },
  { key: 'assignees', label: 'Asignados' },
  { key: 'startDate', label: 'Inicio' },
  { key: 'endDate', label: 'Fin' },
  { key: 'estimatedHours', label: 'Horas est.' },
];
// «Inicio» y «Horas est.» existen pero no vienen activadas: con todas son 8 columnas y la
// tabla no cabe en una pantalla normal.
const COLUMNAS_TAREAS_POR_DEFECTO = ['status', 'priority', 'project', 'assignees', 'endDate'];

// Ancho de cada columna (clases en styles.css). Sin esto la tabla de columnas
// redimensionables reparte el ancho por igual: el título quedaba igual de
// angosto que «Prioridad» y los encabezados se cortaban con «…».
const CLASE_COLUMNA: Record<string, string> = {
  title: 'col-tarea',
  status: 'col-estado',
  priority: 'col-prioridad',
  project: 'col-proyecto',
  assignees: 'col-asignados',
  startDate: 'col-fecha',
  endDate: 'col-fecha',
  estimatedHours: 'col-horas',
};

/** Días que faltan para la fecha fin (negativo = ya venció), contando por día calendario. */
function diasParaVencer(fin: string): number {
  const f = new Date(fin);
  const hoy = new Date();
  const finDia = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((finDia.getTime() - hoyDia.getTime()) / 86_400_000);
}

/**
 * El listado de proyectos viene paginado de 10 en 10. El filtro de proyecto
 * necesita TODOS los de la persona: con solo la primera página, un proyecto
 * más antiguo no aparecía en el desplegable aunque tuviera tareas suyas.
 */
async function cargarTodosLosProyectos(): Promise<{ id: number; name: string }[]> {
  const primera = await getProjects({ page: 1 });
  let todos = primera.data;
  for (let pagina = 2; pagina <= primera.pagination.totalPages; pagina++) {
    const resto = await getProjects({ page: pagina });
    todos = todos.concat(resto.data);
  }
  return todos.map((p: any) => ({ id: p.id, name: p.name }));
}

const fechaCorta = (valor: string | null) => (valor ? new Date(valor).toLocaleDateString('es-EC') : '—');

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = getUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // «Todos» se guarda como cadena vacía: con `|| 'IN_PROGRESS'` esa elección se
  // perdía al recargar y volvía a «En progreso», ocultando las tareas por hacer.
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem('dashboard_status_filter') ?? 'IN_PROGRESS'
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
  // La consulta de tareas espera a saber qué proyectos existen: así un filtro de
  // proyecto guardado que ya no aplica se descarta ANTES de pedir las tareas.
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [tareaAbierta, setTareaAbierta] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { showToast } = useToast();

  // Mueve la tarea de estado sin abrirla: se pinta al instante y, si el servidor la rechaza
  // (p. ej. la persona es observadora de ese proyecto), vuelve al estado anterior.
  async function cambiarEstado(task: Task, nuevo: string) {
    const anterior = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nuevo as Task['status'] } : t)));
    try {
      await updateTask(task.id, { status: nuevo });
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: anterior } : t)));
      showToast('No se pudo cambiar el estado de la tarea. Puede que solo tengas permiso de lectura en ese proyecto.', 'error');
    }
  }
  const columnPrefs = useColumnPreferences('mis-tareas', COLUMNAS_TAREAS_POR_DEFECTO);
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_TAREAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('mis-tareas', ['title', ...columnasVisibles]);

  useEffect(() => {
    cargarTodosLosProyectos()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, []);

  // El proyecto guardado en este navegador puede haber dejado de existir, o la
  // persona haber salido de él. Si no está en la lista, el desplegable mostraba
  // «Todos los proyectos» pero la consulta seguía filtrando por él y la lista
  // salía vacía en todas las pestañas.
  useEffect(() => {
    if (!projectsLoaded || projects.length === 0 || projectFilter === '') return;
    if (!projects.some((p) => p.id === projectFilter)) {
      setProjectFilter('');
      localStorage.setItem('dashboard_project_filter', '');
    }
  }, [projectsLoaded, projects, projectFilter]);

  useEffect(() => {
    if (!projectsLoaded) return;
    setLoading(true);
    getMyTasks({
      status: statusFilter || undefined,
      assignedToMe: assignedToMe || undefined,
      projectId: projectFilter !== '' ? Number(projectFilter) : undefined,
    }).then(setTasks).finally(() => setLoading(false));
  }, [projectsLoaded, statusFilter, assignedToMe, projectFilter, location.key, reloadKey]);

  const { filas: sortedTasks, thProps, SortIcon } = useSortableTable(
    tasks,
    {
      title: (t) => t.title,
      project: (t) => (t as any).project?.name || '',
      status: (t) => STATUS_ORDER[t.status] ?? 99,
      priority: (t) => PRIORITY_ORDER[t.priority] ?? 99,
      assignees: (t) => (t.assignees || []).map((a) => a.user.fullName).sort((a, b) => a.localeCompare(b, 'es'))[0],
      startDate: (t) => (t.startDate ? new Date(t.startDate).getTime() : null),
      endDate: (t) => (t.endDate ? new Date(t.endDate).getTime() : null),
      estimatedHours: (t) => t.estimatedHours ?? null,
    },
    'status',
    'asc',
  );

  const celdaTarea = (key: string, task: Task): ReactNode => {
    switch (key) {
      case 'project':
        return (
          <span className="project-name-chip" title={(task as any).project?.name} onClick={(e) => {
            e.stopPropagation();
            navigate(`/projects/${task.projectId}`);
          }}>
            {(task as any).project?.name || `Proyecto #${task.projectId}`}
          </span>
        );
      case 'status':
        return task.status === 'CANCELLED' ? (
          <span
            className="status-badge"
            style={{ backgroundColor: STATUS_COLORS[task.status] + '22', color: STATUS_COLORS[task.status] }}
          >
            {STATUS_LABELS[task.status]}
          </span>
        ) : (
          <TaskStatusMenu status={task.status} onChange={(nuevo) => cambiarEstado(task, nuevo)} />
        );
      case 'priority':
        return (
          <>
            <span
              className="priority-dot"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
              title={PRIORITY_LABELS[task.priority]}
            />
            {' '}{PRIORITY_LABELS[task.priority]}
          </>
        );
      case 'assignees':
        return (
          <div className="tasks-table-assignees">
            {task.assignees?.slice(0, 3).map((a: any) => (
              <span key={a.user.id} className="tasks-table-assignee-item" title={a.user.fullName}>
                <span className="kanban-avatar">{a.user.fullName.charAt(0)}</span>
              </span>
            ))}
            {task.assignees?.length > 3 && (
              <span className="tasks-table-assignee-item">+{task.assignees.length - 3}</span>
            )}
          </div>
        );
      case 'startDate':
        return fechaCorta(task.startDate);
      case 'endDate': {
        if (!task.endDate) return '—';
        // Solo las tareas abiertas avisan de su vencimiento; una completada o
        // cancelada ya no corre.
        const abierta = task.status !== 'DONE' && task.status !== 'CANCELLED';
        const dias = diasParaVencer(task.endDate);
        const aviso = !abierta ? null : dias < 0 ? 'Vencida' : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : null;
        return (
          <span className={aviso ? (dias < 0 ? 'fecha-vencida' : 'fecha-pronto') : undefined}>
            {fechaCorta(task.endDate)}
            {aviso && <span className="fecha-aviso">{aviso}</span>}
          </span>
        );
      }
      case 'estimatedHours':
        return task.estimatedHours ? `${task.estimatedHours}h` : '—';
      default:
        return null;
    }
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
        <PendingSurveysBanner />

        <div className="admin-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: 'var(--azul-oscuro)' }}>¿Conoces a alguien interesado en Gemeseg?</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>Refiere un cliente potencial y Ventas se pondrá en contacto.</p>
          </div>
          <ReferirClienteButton
            forceOpen={searchParams.get('abrirReferidos') === '1'}
            onForceOpenHandled={() => {
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('abrirReferidos');
                return next;
              }, { replace: true });
            }}
          />
        </div>

        <div className="page-header-row">
          <div>
            <p className="page-eyebrow">TAREAS</p>
            <h1>Mis tareas</h1>
          </div>
          <button className="auth-btn" onClick={() => setShowCreateTask(true)}>
            + Nueva tarea
          </button>
        </div>

        <div className="dashboard-toolbar">
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

          <div className="dashboard-toolbar-tools">
            <button
              type="button"
              className={`filter-btn ${assignedToMe ? 'active' : ''}`}
              aria-pressed={assignedToMe}
              onClick={() => {
                const next = !assignedToMe;
                setAssignedToMe(next);
                localStorage.setItem('dashboard_assigned_to_me', String(next));
              }}
            >
              <UserCheck size={15} /> Asignadas a mí
            </button>

            <select
              className="filter-select"
              aria-label="Filtrar por proyecto"
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

            <ColumnPickerMenu
              columns={COLUMNAS_TAREAS}
              visible={columnPrefs.visible}
              pinned={columnPrefs.pinned}
              maxPinned={columnPrefs.maxPinned}
              fixedLabel="Tarea"
              onApply={async (keys, fijas) => {
                const guardado = await columnPrefs.set(keys, fijas);
                if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
              }}
            />
          </div>
        </div>

        {showCreateTask && (
          <CreateTaskModal
            onClose={() => setShowCreateTask(false)}
            onCreated={() => setReloadKey((k) => k + 1)}
          />
        )}

        {tareaAbierta !== null && (
          <TaskDetailModal
            taskId={tareaAbierta}
            onClose={() => setTareaAbierta(null)}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        )}

        <div className="admin-section">
          {loading ? (
            <div className="loading-state">Cargando tareas...</div>
          ) : sortedTasks.length === 0 ? (
            <div className="empty-state">No hay tareas que mostrar con estos filtros.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table dashboard-tasks-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
                <thead>
                  <tr>
                    <th {...thProps('title')} className={`sortable-th ${CLASE_COLUMNA.title}`}>
                      Tarea <SortIcon campo="title" />
                    </th>
                    {columnasVisibles.map((k) => {
                      const col = COLUMNAS_TAREAS.find((c) => c.key === k)!;
                      return (
                        <th key={k} {...thProps(k)} className={`sortable-th ${CLASE_COLUMNA[k] ?? ''}`}>
                          {col.label} <SortIcon campo={k} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="tasks-table-row"
                      onClick={() => setTareaAbierta(task.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="tasks-table-title">
                        <span className="tools-name">{task.title}</span>
                      </td>
                      {columnasVisibles.map((k) => (
                        <td key={k} className={k === 'startDate' || k === 'endDate' ? 'tasks-table-date' : undefined}>
                          {celdaTarea(k, task)}
                        </td>
                      ))}
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
