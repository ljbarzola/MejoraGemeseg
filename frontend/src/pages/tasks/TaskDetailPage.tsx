import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTask,
  updateTask,
  getProjectMembers,
  deleteTask,
} from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task, ProjectMember } from '../../types/task';
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, STATUS_COLORS } from '../../types/task';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const currentUser = getUser();

  const isViewer = members.some(
    (m) => m.user.email === currentUser?.email && m.role === 'VIEWER',
  );

  useEffect(() => {
    if (!id) return;
    getTask(Number(id))
      .then((t) => {
        setTask(t);
        return getProjectMembers(t.projectId);
      })
      .then(setMembers)
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    setUpdating(true);
    try {
      const updated = await updateTask(task.id, { status: newStatus });
      setTask(updated);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async (assigneeId: number | null) => {
    if (!task) return;
    setUpdating(true);
    try {
      const updated = await updateTask(task.id, { assigneeId });
      setTask(updated);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm('┬┐Eliminar esta tarea?')) return;
    try {
      await deleteTask(task.id);
      navigate(`/projects/${task.projectId}`);
    } catch {
      // silent
    }
  };

  if (loading) return <div className="loading-state">Cargando tarea...</div>;
  if (!task) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate(`/projects/${task.projectId}`)}>
        &larr; Volver al proyecto
      </button>

      <div className="page-card" style={{ maxWidth: '700px' }}>
        <div className="page-header-row" style={{ marginBottom: '24px' }}>
          <div>
            <p className="page-eyebrow">Tarea #{task.id}</p>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{task.title}</h1>
          </div>
          <span
            className="status-badge status-badge-lg"
            style={{
              backgroundColor: STATUS_COLORS[task.status] + '20',
              color: STATUS_COLORS[task.status],
            }}
          >
            {STATUS_LABELS[task.status]}
          </span>
        </div>

        {task.description && (
          <p style={{ color: '#666', marginBottom: '24px' }}>{task.description}</p>
        )}

        <div className="project-detail-meta" style={{ marginBottom: '24px' }}>
          <div className="meta-item">
            <span className="meta-label">Prioridad</span>
            <span
              className="meta-value"
              style={{ color: PRIORITY_COLORS[task.priority] }}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha l├¡mite</span>
            <span className="meta-value">
              {task.dueDate
                ? new Date(task.dueDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Horas estimadas</span>
            <span className="meta-value">
              {task.estimatedHours ? `${task.estimatedHours}h` : 'ΓÇö'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Creada</span>
            <span className="meta-value">
              {new Date(task.createdAt).toLocaleDateString('es-EC')}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: 'var(--azul-claro)', fontSize: '0.9rem', marginBottom: '12px' }}>
            Asignado a
          </h3>
          <select
            className="form-group"
            value={task.assigneeId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              handleAssign(val ? Number(val) : null);
            }}
            disabled={updating || isViewer}
            style={{
              padding: '12px 16px',
              border: `2px solid ${isViewer ? '#ddd' : 'var(--gris-claro)'}`,
              borderRadius: '12px',
              fontSize: '0.95rem',
              fontFamily: 'inherit',
              width: '100%',
              background: isViewer ? '#f5f5f5' : 'white',
              cursor: isViewer ? 'not-allowed' : 'pointer',
              opacity: isViewer ? 0.6 : 1,
            }}
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.fullName} ({m.role})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: 'var(--azul-claro)', fontSize: '0.9rem', marginBottom: '12px' }}>
            Cambiar estado
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((s) => (
              <button
                key={s}
                className={`filter-btn ${isViewer ? 'btn-disabled' : ''}`}
                style={{
                  borderColor: STATUS_COLORS[s],
                  color: task.status === s || isViewer ? 'white' : STATUS_COLORS[s],
                  backgroundColor: task.status === s ? STATUS_COLORS[s] : isViewer ? '#ccc' : 'white',
                  opacity: isViewer ? 0.5 : 1,
                  cursor: isViewer ? 'not-allowed' : task.status === s ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (!isViewer) handleStatusChange(s);
                }}
                disabled={updating || task.status === s || isViewer}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {!isViewer && (
          <div className="form-actions">
            <button className="btn-secondary" onClick={handleDelete} style={{ color: '#ef4444' }}>
              Eliminar tarea
            </button>
          </div>
        )}

        {isViewer && (
          <div style={{ padding: '12px', background: '#f8f8f8', borderRadius: '8px', color: '#888', fontSize: '0.85rem', textAlign: 'center' }}>
            Solo lectura ΓÇö los observadores no pueden modificar tareas
          </div>
        )}
      </div>
    </div>
  );
}
