import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getTask, updateTask, getProjectMembers, deleteTask } from '../../services/task.service';
import { getUser } from '../../services/auth.service';
import type { Task, ProjectMember } from '../../types/task';
import { STATUS_LABELS, STATUS_COLORS } from '../../types/task';
import ConfirmDialog from '../common/ConfirmDialog';
import DateInput from '../common/DateInput';
import ReminderPicker, { RECORDATORIOS_POR_DEFECTO } from './ReminderPicker';

interface Props {
  taskId: number;
  onClose: () => void;
  /** Se llama tras guardar o eliminar, antes de cerrar: el padre recarga su lista. */
  onChanged?: () => void;
}

const FORM_VACIO = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  startDate: '',
  endDate: '',
  estimatedHours: 0,
  status: 'TODO',
};

/**
 * Tarea abierta como ventana encima de la pantalla en la que estás (lista de «Mis tareas», proyecto o
 * tablero), en vez de llevarte a otra página. Es el mismo formulario que tenía TaskDetailPage.
 * Cerrar con cambios sin guardar pregunta antes; guardar cierra y refresca la lista de atrás.
 */
export default function TaskDetailModal({ taskId, onClose, onChanged }: Props) {
  const currentUser = getUser();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [reminderDays, setReminderDays] = useState<number[]>([]);
  const [hoursFocused, setHoursFocused] = useState(false);
  const inicial = useRef<{ form: typeof FORM_VACIO; assignees: number[]; reminders: number[] } | null>(null);
  const [pidiendoDescartar, setPidiendoDescartar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const isViewer = members.some((m) => m.user.email === currentUser?.email && m.role === 'VIEWER');

  useEffect(() => {
    setLoading(true);
    getTask(taskId)
      .then(async (t) => {
        const f = {
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          startDate: t.startDate ? t.startDate.split('T')[0] : '',
          endDate: t.endDate ? t.endDate.split('T')[0] : '',
          estimatedHours: t.estimatedHours ?? 0,
          status: t.status,
        };
        const asignados = t.assignees.map((a) => a.user.id);
        const recordatorios = t.reminderDays ?? [];
        setTask(t);
        setForm(f);
        setSelectedAssignees(asignados);
        setReminderDays(recordatorios);
        inicial.current = { form: f, assignees: asignados, reminders: recordatorios };
        setMembers(await getProjectMembers(t.projectId));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [taskId]);

  const dirty =
    !!inicial.current &&
    (JSON.stringify(form) !== JSON.stringify(inicial.current.form) ||
      JSON.stringify(selectedAssignees) !== JSON.stringify(inicial.current.assignees) ||
      JSON.stringify([...reminderDays].sort()) !== JSON.stringify([...inicial.current.reminders].sort()));

  // Un error pintado arriba pasa desapercibido si la persona ya bajó hasta los botones.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // Recargar la página con cambios sin guardar avisa, igual que cuando esto era una página.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const intentarCerrar = () => {
    if (dirty) setPidiendoDescartar(true);
    else onClose();
  };

  const handleChange = (field: string, value: any) => {
    // Al ponerle fecha fin por primera vez a una tarea sin recordatorios, queda el de 1 día antes.
    if (field === 'endDate' && value && !form.endDate && reminderDays.length === 0) {
      setReminderDays(RECORDATORIOS_POR_DEFECTO);
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssignee = (userId: number) => {
    if (isViewer) return;
    setSelectedAssignees((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const guardar = async (): Promise<boolean> => {
    if (!task) return false;
    setSaving(true);
    setError('');
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
        reminderDays: form.endDate ? reminderDays : undefined,
      });
      onChanged?.();
      onClose();
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' && msg.length < 140 ? msg : 'No se pudo guardar la tarea. Inténtalo de nuevo.');
      setPidiendoDescartar(false);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!task) return;
    setConfirmandoEliminar(false);
    try {
      await deleteTask(task.id);
      onChanged?.();
      onClose();
    } catch {
      setError('No se pudo eliminar la tarea. Inténtalo de nuevo.');
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={intentarCerrar}>
      <div className="modal modal-lg modal-tarea" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{task ? `Tarea #${task.id}` : 'Tarea'}</h3>
          <button className="modal-close" onClick={intentarCerrar} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: 40 }}>Cargando tarea...</div>
        ) : loadError || !task ? (
          <div className="modal-body">
            <div className="auth-error-banner">No se pudo abrir la tarea. Puede que ya no exista o que no tengas acceso.</div>
          </div>
        ) : (
          <>
            <div className="modal-body">
              {error && (
                <div ref={errorRef} className="auth-error-banner">{error}</div>
              )}

              <div className="form-group">
                <label htmlFor="tm-title">Título *</label>
                <input
                  id="tm-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  disabled={isViewer}
                />
              </div>

              <div className="form-group">
                <label htmlFor="tm-description">Descripción</label>
                <textarea
                  id="tm-description"
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="form-textarea"
                  rows={3}
                  disabled={isViewer}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="tm-priority">Prioridad</label>
                  <select
                    id="tm-priority"
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
                  <label htmlFor="tm-hours">Horas estimadas</label>
                  <input
                    id="tm-hours"
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
                  <label htmlFor="tm-start">Fecha inicio</label>
                  <DateInput id="tm-start" value={form.startDate} onChange={(v) => handleChange('startDate', v)} disabled={isViewer} />
                </div>
                <div className="form-group">
                  <label htmlFor="tm-end">Fecha fin</label>
                  <DateInput id="tm-end" value={form.endDate} onChange={(v) => handleChange('endDate', v)} disabled={isViewer} />
                </div>
              </div>

              <ReminderPicker value={reminderDays} onChange={setReminderDays} hasDate={!!form.endDate} disabled={isViewer} />

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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                <div style={{ padding: 12, background: '#f8f8f8', borderRadius: 8, color: '#888', fontSize: '0.85rem', textAlign: 'center' }}>
                  Solo lectura — los observadores no pueden modificar tareas
                </div>
              )}
            </div>

            <div className="modal-actions">
              {!isViewer && (
                <button
                  className="btn-secondary"
                  onClick={() => setConfirmandoEliminar(true)}
                  style={{ color: '#ef4444', marginRight: 'auto' }}
                >
                  Eliminar tarea
                </button>
              )}
              <button className="btn-secondary" onClick={intentarCerrar}>
                {isViewer ? 'Cerrar' : 'Cancelar'}
              </button>
              {!isViewer && (
                <button className="auth-btn" onClick={guardar} disabled={saving || !form.title.trim() || !dirty}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>

      {pidiendoDescartar && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cambios sin guardar</h3>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>Tienes cambios sin guardar. ¿Qué deseas hacer?</p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPidiendoDescartar(false)}>Seguir editando</button>
              <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={onClose}>Descartar</button>
              <button className="auth-btn" onClick={guardar} disabled={saving || !form.title.trim()}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar tarea"
          message="¿Eliminar esta tarea?"
          confirmLabel="Eliminar"
          danger
          onConfirm={eliminar}
          onCancel={() => setConfirmandoEliminar(false)}
        />
      )}
    </>
  );
}
