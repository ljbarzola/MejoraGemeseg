import { useNavigate } from 'react-router-dom';
import { getUser, removeToken } from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';
import { usePerm } from '../../contexts/PermissionsContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { theme } = useCompany();
  const { canView, isSuperAdmin } = usePerm();
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const isCompanyAdmin = isAdmin && !!user?.companyId;

  const handleLogout = () => {
    removeToken();
    localStorage.removeItem('company_theme');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/dashboard')}>
        <span className="navbar-logo">
          {theme.logoUrl ? (
            <img
              src={theme.logoUrl}
              alt={theme.name}
              style={{ height: '28px' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : null}
          <span style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>{theme.name}</span>
        </span>
      </div>
      <div className="navbar-links">
        <button className="navbar-link" onClick={() => navigate('/dashboard')}>Inicio</button>
        {canView('PROJECTS') && (
          <button className="navbar-link" onClick={() => navigate('/projects')}>Proyectos</button>
        )}
        {canView('ADMIN') && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin')}>Administración</button>
        )}
        {isSuperAdmin && canView('COMPANIES') && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/companies')}>Empresas</button>
        )}
        {isCompanyAdmin && canView('COMPANY_SETTINGS') && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/company-settings')}>Mi Empresa</button>
        )}
        {canView('TOOLS') && (
          <button className="navbar-link" onClick={() => navigate('/tools')}>Herramientas</button>
        )}
        {canView('AGENTS') && (
          <button className="navbar-link" onClick={() => navigate('/admin/agents')}>Agentes</button>
        )}
        {canView('CACAO') && (
          <button className="navbar-link navbar-link-cacao" onClick={() => navigate('/cacao')}>Cacao</button>
        )}
        {canView('CUSTODIAS') && (
          <button className="navbar-link" onClick={() => navigate('/custodias')}>Custodias</button>
        )}
        {isSuperAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/permissions')}>Permisos</button>
        )}
        {isCompanyAdmin && (
          <button className="navbar-link navbar-link-admin" onClick={() => navigate('/admin/user-permissions')}>Permisos Usuarios</button>
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
