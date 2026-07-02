import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject } from '../../services/project.service';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  ON_HOLD: '#f59e0b',
  COMPLETED: '#3b82f6',
  CANCELLED: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getProject(Number(id))
        .then(setProject)
        .catch(() => navigate('/projects'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  if (loading) return <div className="loading-state">Cargando proyecto...</div>;
  if (!project) return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/projects')}>
        &larr; Volver a proyectos
      </button>

      <div className="project-detail">
        <div className="project-detail-header">
          <h1>{project.name}</h1>
          <span
            className="status-badge status-badge-lg"
            style={{
              backgroundColor: STATUS_COLORS[project.status] + '20',
              color: STATUS_COLORS[project.status],
            }}
          >
            {STATUS_LABELS[project.status]}
          </span>
        </div>

        {project.description && (
          <p className="project-detail-desc">{project.description}</p>
        )}

        <div className="project-detail-meta">
          <div className="meta-item">
            <span className="meta-label">Creado por</span>
            <span className="meta-value">{project.createdBy.fullName}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de inicio</span>
            <span className="meta-value">
              {project.startDate
                ? new Date(project.startDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de fin</span>
            <span className="meta-value">
              {project.endDate
                ? new Date(project.endDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Tareas</span>
            <span className="meta-value">{project._count.tasks}</span>
          </div>
        </div>

        <div className="project-members">
          <h2>Miembros ({project.members.length})</h2>
          <div className="members-list">
            {project.members.map((m: any) => (
              <div key={m.id} className="member-item">
                <div className="member-avatar">
                  {m.user.fullName.charAt(0)}
                </div>
                <div>
                  <div className="member-name">{m.user.fullName}</div>
                  <div className="member-role">{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="project-actions">
          <button className="auth-btn" onClick={() => navigate(`/projects/${id}/board`)}>
            Ver tablero Kanban
          </button>
        </div>
      </div>
    </div>
  );
}
