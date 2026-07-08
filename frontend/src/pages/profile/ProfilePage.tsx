import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../../services/user.service';
import type { ProfileData } from '../../services/user.service';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  EMPLOYEE: 'Empleado',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Cargando perfil...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <p>No se pudo cargar el perfil</p>
          <button className="auth-btn" onClick={() => navigate('/dashboard')}>Volver al dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/dashboard')}>
        &larr; Volver al dashboard
      </button>

      <div className="page-card" style={{ maxWidth: '640px' }}>
        <div className="profile-header">
          <div className="profile-avatar">{profile.fullName.charAt(0)}</div>
          <div>
            <h1 className="profile-name">{profile.fullName}</h1>
            <span
              className="role-badge"
              style={{
                background: profile.role === 'ADMIN' ? 'linear-gradient(135deg, #fef3c7, #fde68a)' :
                  profile.role === 'MANAGER' ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' :
                    'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                color: profile.role === 'ADMIN' ? '#92400e' :
                  profile.role === 'MANAGER' ? '#1e40af' : '#3730a3',
              }}
            >
              {ROLE_LABELS[profile.role] || profile.role}
            </span>
          </div>
        </div>

        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Correo corporativo</span>
            <span className="profile-info-value">{profile.email}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Documento de identidad</span>
            <span className="profile-info-value">{profile.documentNumber || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Cargo</span>
            <span className="profile-info-value">{profile.position || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Departamento</span>
            <span className="profile-info-value">{profile.department?.name || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Miembro desde</span>
            <span className="profile-info-value">
              {new Date(profile.createdAt).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.createdProjects}</span>
            <span className="profile-stat-label">Proyectos creados</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.projectMemberships}</span>
            <span className="profile-stat-label">Proyectos asignados</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.taskAssignees}</span>
            <span className="profile-stat-label">Tareas asignadas</span>
          </div>
        </div>

        <div className="profile-tools-section">
          <h2 className="profile-tools-title">Herramientas asignadas ({profile.toolAssignments.length})</h2>
          {profile.toolAssignments.length === 0 ? (
            <div className="profile-tools-empty">No tienes herramientas asignadas</div>
          ) : (
            <div className="profile-tools-grid">
              {profile.toolAssignments.map((ta) => (
                <div key={ta.id} className="profile-tool-card">
                  <div className="profile-tool-icon">🛠</div>
                  <div className="profile-tool-info">
                    <span className="profile-tool-name">{ta.tool.name}</span>
                    {ta.tool.category && <span className="tools-category">{ta.tool.category}</span>}
                    {ta.version && <span className="tools-version">v{ta.version}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
