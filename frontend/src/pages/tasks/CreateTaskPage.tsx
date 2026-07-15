import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { createTask, getProjectMembers } from '../../services/task.service';
import { getProjects } from '../../services/project.service';
import { STATUS_LABELS, STATUS_COLORS } from '../../types/task';
import type { ProjectMember } from '../../types/task';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedHours: z.coerce.number().min(0),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
});

type TaskForm = {
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate?: string;
  endDate?: string;
  estimatedHours: number;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
};

export default function CreateTaskPage() {
  const { id: projectIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [hoursFocused, setHoursFocused] = useState(false);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectIdParam || '');

  const effectiveProjectId = projectIdParam || selectedProjectId;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: { priority: 'MEDIUM', estimatedHours: 0, status: 'TODO' },
  });

  useEffect(() => {
    if (!projectIdParam) {
      getProjects({ page: 1 })
        .then((res) => setProjects(res.data.map((p: any) => ({ id: p.id, name: p.name }))))
        .catch(() => {});
    }
  }, [projectIdParam]);

  useEffect(() => {
    if (effectiveProjectId) {
      getProjectMembers(Number(effectiveProjectId)).then(setMembers).catch(() => {});
    }
  }, [effectiveProjectId]);

  const toggleAssignee = (userId: number) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const onSubmit = async (data: TaskForm) => {
    if (!effectiveProjectId) {
      setServerError('Selecciona un proyecto');
      return;
    }
    setServerError('');
    setLoading(true);
    try {
      const payload: any = { ...data, assigneeIds: selectedAssignees };
      if (!payload.startDate) delete payload.startDate;
      if (!payload.endDate) delete payload.endDate;
      await createTask(Number(effectiveProjectId), payload);
      navigate(`/projects/${effectiveProjectId}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Error al crear tarea';
      setServerError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <button
        className="btn-back"
        onClick={() => effectiveProjectId ? navigate(`/projects/${effectiveProjectId}`) : navigate('/dashboard')}
      >
        &larr; {effectiveProjectId ? 'Volver al proyecto' : 'Volver al dashboard'}
      </button>

      <div className="page-card">
        <div className="page-header">
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Tarea nueva</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {serverError && (
            <div className="auth-error-banner">{serverError}</div>
          )}

          {!projectIdParam && (
            <div className="form-group">
              <label htmlFor="project">Proyecto *</label>
              <select
                id="project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className={!selectedProjectId ? 'input-error' : ''}
              >
                <option value="">Seleccionar proyecto...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!selectedProjectId && (
                <span className="field-error">Debes seleccionar un proyecto</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="title">Título *</label>
            <input
              id="title"
              type="text"
              placeholder="Nombre de la tarea"
              {...register('title')}
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && (
              <span className="field-error">{errors.title.message}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              placeholder="Detalles de la tarea (opcional)"
              {...register('description')}
              className="form-textarea"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priority">Prioridad</label>
              <select id="priority" {...register('priority')}>
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
                value={hoursFocused && watch('estimatedHours') === 0 ? '' : watch('estimatedHours')}
                onFocus={() => setHoursFocused(true)}
                onBlur={() => setHoursFocused(false)}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                  setValue('estimatedHours', val);
                }}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Fecha inicio</label>
              <input id="startDate" type="date" {...register('startDate')} />
            </div>

            <div className="form-group">
              <label htmlFor="endDate">Fecha fin</label>
              <input id="endDate" type="date" {...register('endDate')} />
            </div>
          </div>

          <div className="form-group">
            <label>Asignar a</label>
            <div className="assignee-chips">
              {!effectiveProjectId ? (
                <span className="assignee-empty">Selecciona un proyecto primero</span>
              ) : members.length === 0 ? (
                <span className="assignee-empty">No hay miembros en el proyecto</span>
              ) : (
                members.map((m) => (
                  <button
                    key={m.user.id}
                    type="button"
                    className={`assignee-chip ${selectedAssignees.includes(m.user.id) ? 'assignee-chip-active' : ''}`}
                    onClick={() => toggleAssignee(m.user.id)}
                  >
                    <span className="assignee-chip-avatar">{m.user.fullName.charAt(0)}</span>
                    {m.user.fullName}
                  </button>
                ))
              )}
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
                    color: watch('status') === s ? 'white' : STATUS_COLORS[s],
                    backgroundColor: watch('status') === s ? STATUS_COLORS[s] : 'white',
                    cursor: 'pointer',
                  }}
                  onClick={() => setValue('status', s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => effectiveProjectId ? navigate(`/projects/${effectiveProjectId}`) : navigate('/dashboard')}
            >
              Cancelar
            </button>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creando...' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
