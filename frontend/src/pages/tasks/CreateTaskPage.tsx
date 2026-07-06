import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createTask } from '../../services/task.service';

const schema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  dueDate: z.string().optional(),
  estimatedHours: z.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
];

export default function CreateTaskPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      setError('');
      await createTask(Number(projectId), {
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate || undefined,
        estimatedHours: data.estimatedHours || undefined,
      });
      navigate(`/projects/${projectId}/board`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear tarea');
    }
  };

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate(`/projects/${projectId}/board`)}>
        &larr; Volver al tablero
      </button>

      <div className="page-card">
        <div className="page-header">
          <div className="page-eyebrow">Nueva Tarea</div>
          <h1>Crear Tarea</h1>
          <p className="page-subtitle">Agrega una nueva tarea al proyecto</p>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label>Título *</label>
            <input
              {...register('title')}
              className={errors.title ? 'input-error' : ''}
              placeholder="Ej: Configurar base de datos"
            />
            {errors.title && <span className="field-error">{errors.title.message}</span>}
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <textarea
              {...register('description')}
              className="form-textarea"
              rows={3}
              placeholder="Describe la tarea..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Prioridad</label>
              <select {...register('priority')} className="form-select">
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Fecha límite</label>
              <input
                type="date"
                {...register('dueDate')}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Horas estimadas</label>
            <input
              type="number"
              {...register('estimatedHours', { valueAsNumber: true })}
              min="0"
              step="0.5"
              placeholder="0"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/board`)}>
              Cancelar
            </button>
            <button type="submit" className="auth-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
