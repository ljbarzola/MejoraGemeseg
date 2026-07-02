import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllUsers, type UserListItem } from '../../services/user.service';
import { getUser } from '../../services/auth.service';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: '#dc2626',
  MANAGER: '#2563eb',
  EMPLOYEE: '#16a34a',
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    if (user?.email !== 'sistemas@gemeseg.com') {
      navigate('/dashboard');
      return;
    }
    getAllUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate, user]);

  if (user?.email !== 'sistemas@gemeseg.com') return null;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/dashboard')}>
        &larr; Volver al inicio
      </button>

      <div className="page-header-row">
        <div>
          <div className="page-eyebrow">Administración General</div>
          <h1>Panel de Control</h1>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-number">{users.length}</span>
          <span className="admin-stat-label">Usuarios totales</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-number">{users.filter((u) => u.isActive).length}</span>
          <span className="admin-stat-label">Activos</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-number">{users.filter((u) => u.role === 'ADMIN').length}</span>
          <span className="admin-stat-label">Administradores</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-number">{users.filter((u) => u.role === 'MANAGER').length}</span>
          <span className="admin-stat-label">Gerentes</span>
        </div>
      </div>

      <div className="admin-users-section">
        <h2>Usuarios del Sistema</h2>

        {loading ? (
          <div className="loading-state">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>No hay usuarios registrados</p></div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol Sistema</th>
                  <th>Cargo</th>
                  <th>Departamento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="tasks-table-row">
                    <td className="task-id-cell">{u.id}</td>
                    <td className="task-title-cell">{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: (ROLE_COLORS[u.role] || '#888') + '20',
                          color: ROLE_COLORS[u.role] || '#888',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>{u.position || '-'}</td>
                    <td>{u.department?.name || '-'}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: u.isActive ? '#22c55e20' : '#ef444420',
                          color: u.isActive ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
