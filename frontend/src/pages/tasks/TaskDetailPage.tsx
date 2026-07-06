import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTask, updateTask } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task } from '../../types/task';

const STATUS_OPTIONS = [
  { value: 'TODO', label: 'Por Hacer' },
  { value: 'IN_PROGRESS', label: 'En Progreso' },
  { value: 'IN_REVIEW', label: 'En Revisión' },
  { value: 'DONE', label: 'Completado' },
];

const STATUS_COLORS: Record<string, string> = {
  TODO: '#6b7280',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#f59e0b',
  DONE: '#22c55e',
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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<(Task & { project: any }) | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUser = getUser();

  useEffect(() => {
    if (id) {
      getTask(Number(id))
        .then(setTask)
        .catch(() => navigate('/projects'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const myMembership = task?.project?.members?.find(
    (m: any) => m.user.id === currentUser?.id,
  );
  const myRole = myMembership?.role;
  const canEdit = myRole && myRole !== 'VIEWER';

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    const updated = await updateTask(task.id, { status: newStatus });
    setTask({ ...task, ...updated });
  };

  const handleAssign = async (assigneeId: number) => {
    if (!task) return;
    const updated = await updateTask(task.id, { assigneeId });
    setTask({ ...task, ...updated });
  };

  if (loading) return <div className="loading-state">Cargando tarea...</div>;
  if (!task) return null;

  const members = task.project?.members || [];

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate(`/projects/${task.project.id}/board`)}>
        &larr; Volver al tablero
      </button>

      <div className="task-detail">
        <div className="task-detail-header">
          <div>
            <span className="task-detail-id">#{task.id}</span>
            <h1>{task.title}</h1>
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
          <span
            className="status-badge status-badge-lg"
            style={{ backgroundColor: STATUS_COLORS[task.status] + '20', color: STATUS_COLORS[task.status] }}
          >
            {STATUS_OPTIONS.find((s) => s.value === task.status)?.label}
          </span>
        </div>

        {task.description && (
          <p className="task-detail-desc">{task.description}</p>
        )}

        <div className="task-detail-meta">
          <div className="meta-item">
            <span className="meta-label">Prioridad</span>
            <span className="meta-value">{task.priority}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha límite</span>
            <span className="meta-value">
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('es-EC') : 'Sin fecha'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Horas estimadas</span>
            <span className="meta-value">{task.estimatedHours ? `${task.estimatedHours}h` : '-'}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Proyecto</span>
            <span className="meta-value">{task.project.name}</span>
          </div>
        </div>

        <div className="task-actions">
          <div className="form-group">
            <label>Estado</label>
            {canEdit ? (
              <select
                className="form-select"
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            ) : (
              <select className="form-select form-select-disabled" value={task.status} disabled>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Asignado a</label>
            {canEdit ? (
              <select
                className="form-select"
                value={task.assignee?.id || ''}
                onChange={(e) => handleAssign(Number(e.target.value))}
              >
                <option value="">Sin asignar</option>
                {members.map((m: any) => (
                  <option key={m.user.id} value={m.user.id}>{m.user.fullName}</option>
                ))}
              </select>
            ) : (
              <select className="form-select form-select-disabled" value={task.assignee?.id || ''} disabled>
                <option value="">Sin asignar</option>
                {members.map((m: any) => (
                  <option key={m.user.id} value={m.user.id}>{m.user.fullName}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className="viewer-notice">
            Tu rol de Observador no permite editar tareas. Contacta al propietario o gerente del proyecto.
          </div>
        )}

        {task.assignee && (
          <div className="task-assignee-display">
            <div className="kanban-avatar">{task.assignee.fullName.charAt(0)}</div>
            <div>
              <div className="member-name">{task.assignee.fullName}</div>
              <div className="member-role">{task.assignee.email}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
