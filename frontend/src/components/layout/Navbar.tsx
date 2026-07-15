import { useNavigate } from 'react-router-dom';
import { getUser, removeToken } from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { theme } = useCompany();
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const isSuperAdmin = isAdmin && !user?.companyId;
  const isCompanyAdmin = isAdmin && !!user?.companyId;
  const isSystems = user?.email === 'sistemas@gemeseg.com';
  const canManageAgents = isAdmin || isSystems;

  const handleLogout = () => {
    removeToken();
    localStorage.removeItem('company_theme');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/dashboard')}>
        <span className="navbar-logo">
          <img src={theme.logoUrl || '/resources/logo-gemeseg-back-white.png'} alt={theme.name} style={{ height: '28px' }} />
        </span>
      </div>
      <div className="navbar-links">
        <button className="navbar-link" onClick={() => navigate('/dashboard')}>Inicio</button>
        <button className="navbar-link" onClick={() => navigate('/projects')}>Proyectos</button>
        {isAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin')}>Administración</button>
        )}
        {isSuperAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/companies')}>Empresas</button>
        )}
        {isCompanyAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/company-settings')}>Mi Empresa</button>
        )}
        {isSystems && (
          <button className="navbar-link" onClick={() => navigate('/tools')}>Herramientas</button>
        )}
        {canManageAgents && (
          <button className="navbar-link" onClick={() => navigate('/admin/agents')}>Agentes</button>
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
