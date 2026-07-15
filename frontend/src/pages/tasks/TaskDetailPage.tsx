import { useEffect, useState, useRef } from 'react';
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
  const [hoursFocused, setHoursFocused] = useState(false);
  const currentUser = getUser();

  const initialFormRef = useRef<any>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

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

  const [initialAssignees, setInitialAssignees] = useState<number[]>([]);

  useEffect(() => {
    if (!id) return;
    getTask(Number(id))
      .then((t) => {
        setTask(t);
        const formState = {
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          startDate: t.startDate ? t.startDate.split('T')[0] : '',
          endDate: t.endDate ? t.endDate.split('T')[0] : '',
          estimatedHours: t.estimatedHours ?? 0,
          status: t.status,
        };
        setForm(formState);
        initialFormRef.current = formState;
        const assigneeIds = t.assignees.map((a) => a.user.id);
        setSelectedAssignees(assigneeIds);
        setInitialAssignees(assigneeIds);
        return getProjectMembers(t.projectId);
      })
      .then(setMembers)
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!initialFormRef.current) return;
    const formChanged = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
    const assigneesChanged = JSON.stringify(selectedAssignees) !== JSON.stringify(initialAssignees);
    setIsDirty(formChanged || assigneesChanged);
  }, [form, selectedAssignees, initialAssignees]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
      setIsDirty(false);
      initialFormRef.current = form;
      setInitialAssignees(selectedAssignees);
      navigate(-1);
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
      setIsDirty(false);
      navigate(-1);
    } catch {
      // silent
    }
  };

  const safeNavigateBack = () => {
    if (isDirty) {
      pendingNavigationRef.current = () => navigate(-1);
      setShowDiscardModal(true);
    } else {
      navigate(-1);
    }
  };

  const handleDiscard = () => {
    setIsDirty(false);
    setShowDiscardModal(false);
    pendingNavigationRef.current?.();
    pendingNavigationRef.current = null;
  };

  const handleKeepEditing = () => {
    setShowDiscardModal(false);
    pendingNavigationRef.current = null;
  };

  const handleSaveAndLeave = async () => {
    await handleSave();
    setShowDiscardModal(false);
    pendingNavigationRef.current = null;
  };

  if (loading) return <div className="loading-state">Cargando tarea...</div>;
  if (!task) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={safeNavigateBack}>
        &larr; Volver
      </button>

      {showDiscardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Cambios sin guardar</h3>
            <p style={{ margin: '0 0 20px', color: '#666', fontSize: '0.9rem' }}>
              Tienes cambios sin guardar. ¿Qué deseas hacer?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={handleKeepEditing}>
                Cancelar
              </button>
              <button
                className="btn-secondary"
                onClick={handleDiscard}
                style={{ color: '#ef4444' }}
              >
                Descartar
              </button>
              <button
                className="auth-btn"
                onClick={handleSaveAndLeave}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                value={hoursFocused && form.estimatedHours === 0 ? '' : form.estimatedHours}
                onFocus={() => setHoursFocused(true)}
                onBlur={() => setHoursFocused(false)}
                onChange={(e) => handleChange('estimatedHours', e.target.value === '' ? 0 : Number(e.target.value))}
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
