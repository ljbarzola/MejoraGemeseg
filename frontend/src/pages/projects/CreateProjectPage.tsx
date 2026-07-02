import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { createProject } from '../../services/project.service';

const projectSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido'),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    { message: 'La fecha de fin debe ser posterior a la fecha de inicio', path: ['endDate'] },
  );

type ProjectForm = z.infer<typeof projectSchema>;

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
  });

  const onSubmit = async (data: ProjectForm) => {
    setServerError('');
    setLoading(true);
    try {
      const project = await createProject(data);
      navigate(`/projects/${project.id}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Error al crear el proyecto';
      setServerError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-card">
        <div className="page-header">
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Crear proyecto</h1>
          <p className="page-subtitle">
            Crea un nuevo proyecto para organizar el trabajo de tu equipo
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {serverError && (
            <div className="auth-error-banner">{serverError}</div>
          )}

          <div className="form-group">
            <label htmlFor="name">Nombre del proyecto *</label>
            <input
              id="name"
              type="text"
              placeholder="Ej: Campaña Marketing Q3"
              {...register('name')}
              className={errors.name ? 'input-error' : ''}
            />
            {errors.name && (
              <span className="field-error">{errors.name.message}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              placeholder="Describe el alcance del proyecto..."
              rows={3}
              {...register('description')}
              className="form-textarea"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Fecha de inicio</label>
              <input
                id="startDate"
                type="date"
                {...register('startDate')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="endDate">Fecha de fin</label>
              <input
                id="endDate"
                type="date"
                {...register('endDate')}
                className={errors.endDate ? 'input-error' : ''}
              />
              {errors.endDate && (
                <span className="field-error">{errors.endDate.message}</span>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/projects')}
            >
              Cancelar
            </button>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creando...' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
