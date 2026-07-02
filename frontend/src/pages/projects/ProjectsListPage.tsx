import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProjects } from '../../services/project.service';
import type { Project } from '../../types/project';

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

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(searchParams.get('status') || '');

  useEffect(() => {
    loadProjects();
  }, [searchParams]);

  async function loadProjects() {
    setLoading(true);
    try {
      const page = parseInt(searchParams.get('page') || '1');
      const status = searchParams.get('status') || undefined;
      const res = await getProjects({ status, page });
      setProjects(res.data);
      setPagination(res.pagination);
    } catch {
      // error handling silencioso
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(status: string) {
    setFilter(status);
    const params = new URLSearchParams(searchParams);
    if (status) {
      params.set('status', status);
    } else {
      params.delete('status');
    }
    params.delete('page');
    setSearchParams(params);
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    setSearchParams(params);
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Proyectos</h1>
        </div>
        <button className="auth-btn" onClick={() => navigate('/projects/new')}>
          + Nuevo proyecto
        </button>
      </div>

      <div className="filter-bar">
        <button
          className={`filter-btn ${filter === '' ? 'active' : ''}`}
          onClick={() => handleFilterChange('')}
        >
          Todos
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => handleFilterChange(key)}
          >
            <span
              className="status-dot"
              style={{ backgroundColor: STATUS_COLORS[key] }}
            />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Cargando proyectos...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <p>No hay proyectos{filter ? ` con estado "${STATUS_LABELS[filter]}"` : ''}</p>
          <button className="auth-btn" onClick={() => navigate('/projects/new')}>
            Crear primer proyecto
          </button>
        </div>
      ) : (
        <>
          <div className="project-count">{pagination.total} proyecto(s) encontrado(s)</div>
          <div className="project-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="project-card-header">
                  <h3>{project.name}</h3>
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: STATUS_COLORS[project.status] + '20',
                      color: STATUS_COLORS[project.status],
                    }}
                  >
                    {STATUS_LABELS[project.status]}
                  </span>
                </div>
                {project.description && (
                  <p className="project-card-desc">{project.description}</p>
                )}
                <div className="project-card-meta">
                  <span>{project._count.tasks} tareas</span>
                  <span>{project._count.members} miembros</span>
                  {project.endDate && (
                    <span>
                      Vence: {new Date(project.endDate).toLocaleDateString('es-EC')}
                    </span>
                  )}
                </div>
                <div className="project-card-footer">
                  <span className="project-card-owner">
                    Creado por {project.createdBy.fullName}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Anterior
              </button>
              <span className="pagination-info">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
