import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { createTask } from '../../services/task.service';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  dueDate: z.string().optional(),
  estimatedHours: z.coerce.number().min(0).optional().optional(),
});

type TaskForm = {
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  estimatedHours?: number;
};

export default function CreateTaskPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: { priority: 'MEDIUM' },
  });

  const onSubmit = async (data: TaskForm) => {
    if (!projectId) return;
    setServerError('');
    setLoading(true);
    try {
      await createTask(Number(projectId), data);
      navigate(`/projects/${projectId}`);
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
      <button className="btn-back" onClick={() => navigate(`/projects/${projectId}`)}>
        &larr; Volver al proyecto
      </button>

      <div className="page-card">
        <div className="page-header">
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Crear tarea</h1>
          <p className="page-subtitle">
            Registra una nueva tarea dentro del proyecto
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {serverError && (
            <div className="auth-error-banner">{serverError}</div>
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
              <label htmlFor="dueDate">Fecha límite</label>
              <input id="dueDate" type="date" {...register('dueDate')} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="estimatedHours">Horas estimadas</label>
            <input
              id="estimatedHours"
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              {...register('estimatedHours')}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/projects/${projectId}`)}
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
