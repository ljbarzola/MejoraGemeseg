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
import { STATUS_LABELS, STATUS_COLORS } from '../../types/task';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const currentUser = getUser();

  const isViewer = members.some(
    (m) => m.user.email === currentUser?.email && m.role === 'VIEWER',
  );

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    startDate: '',
    endDate: '',
    estimatedHours: 0,
    status: 'TODO',
  });

  useEffect(() => {
    if (!id) return;
    getTask(Number(id))
      .then((t) => {
        setTask(t);
        setForm({
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          startDate: t.startDate ? t.startDate.split('T')[0] : '',
          endDate: t.endDate ? t.endDate.split('T')[0] : '',
          estimatedHours: t.estimatedHours ?? 0,
          status: t.status,
        });
        setSelectedAssignees(t.assignees.map((a) => a.user.id));
        return getProjectMembers(t.projectId);
      })
      .then(setMembers)
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssignee = (userId: number) => {
    if (isViewer) return;
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        estimatedHours: form.estimatedHours,
        assigneeIds: selectedAssignees,
        status: form.status,
      });
      navigate(`/projects/${task.projectId}`);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm('¿Eliminar esta tarea?')) return;
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

      <div className="page-card">
        <div className="page-header">
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Tarea #{task.id}</h1>
        </div>

        <div className="auth-form">
          <div className="form-group">
            <label htmlFor="title">Título *</label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              disabled={isViewer}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="form-textarea"
              rows={3}
              disabled={isViewer}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priority">Prioridad</label>
              <select
                id="priority"
                value={form.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                disabled={isViewer}
              >
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="estimatedHours">Horas estimadas</label>
              <input
                id="estimatedHours"
                type="number"
                min="0"
                step="0.5"
                value={form.estimatedHours}
                onChange={(e) => handleChange('estimatedHours', Number(e.target.value))}
                disabled={isViewer}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Fecha inicio</label>
              <input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                disabled={isViewer}
              />
            </div>

            <div className="form-group">
              <label htmlFor="endDate">Fecha fin</label>
              <input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(e) => handleChange('endDate', e.target.value)}
                disabled={isViewer}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Asignar a</label>
            <div className="assignee-chips">
              {members.map((m) => (
                <button
                  key={m.user.id}
                  type="button"
                  className={`assignee-chip ${selectedAssignees.includes(m.user.id) ? 'assignee-chip-active' : ''}`}
                  onClick={() => toggleAssignee(m.user.id)}
                  disabled={isViewer}
                >
                  <span className="assignee-chip-avatar">{m.user.fullName.charAt(0)}</span>
                  {m.user.fullName}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Estado</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="filter-btn"
                  style={{
                    borderColor: STATUS_COLORS[s],
                    color: form.status === s ? 'white' : STATUS_COLORS[s],
                    backgroundColor: form.status === s ? STATUS_COLORS[s] : 'white',
                    cursor: isViewer ? 'not-allowed' : 'pointer',
                    opacity: isViewer ? 0.5 : 1,
                  }}
                  onClick={() => !isViewer && handleChange('status', s)}
                  disabled={isViewer}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {isViewer && (
            <div style={{ padding: '12px', background: '#f8f8f8', borderRadius: '8px', color: '#888', fontSize: '0.85rem', textAlign: 'center' }}>
              Solo lectura — los observadores no pueden modificar tareas
            </div>
          )}

          {!isViewer && (
            <div className="form-actions">
              <button className="btn-secondary" onClick={handleDelete} style={{ color: '#ef4444' }}>
                Eliminar tarea
              </button>
              <button
                className="auth-btn"
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
              >
                {saving ? 'Guardando...' : 'Guardar y volver'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
