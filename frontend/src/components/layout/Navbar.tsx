import { useNavigate } from 'react-router-dom';
import { getUser, removeToken } from '../../services/auth.service';

export default function Navbar() {
  const navigate = useNavigate();
  const user = getUser();
  const isAdmin = user?.email === 'admin@gemeseg.com' || user?.role === 'ADMIN';
  const isSystems = user?.email === 'sistemas@gemeseg.com';

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/dashboard')}>
        <span className="navbar-logo">GEMESEG</span>
      </div>
      <div className="navbar-links">
        <button className="navbar-link" onClick={() => navigate('/dashboard')}>Inicio</button>
        <button className="navbar-link" onClick={() => navigate('/projects')}>Proyectos</button>
        {isAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin')}>Administración</button>
        )}
        {isSystems && (
          <button className="navbar-link" onClick={() => navigate('/tools')}>Herramientas</button>
        )}
      </div>
      <div className="navbar-user">
        {user && (
          <button className="navbar-name navbar-link" onClick={() => navigate('/profile')}>
            {user.fullName}
          </button>
        )}
        <button className="btn-logout-sm" onClick={handleLogout}>Cerrar sesión</button>
      </div>
    </nav>
  );
}
