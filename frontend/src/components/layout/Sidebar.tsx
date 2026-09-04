import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUser, removeToken } from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';
import { usePerm } from '../../contexts/PermissionsContext';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useCompany();
  const { canView, isSuperAdmin } = usePerm();
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const isCompanyAdmin = isAdmin && !!user?.companyId;
  const [collapsed, setCollapsed] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [custodiosOpen, setCustodiosOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [ventasOpen, setVentasOpen] = useState(false);
  const [custodiasOpen, setCustodiasOpen] = useState(false);

  const handleLogout = () => {
    removeToken();
    localStorage.removeItem('company_theme');
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isPersonalActive = location.pathname.startsWith('/personal');
  const isVentasActive = location.pathname.startsWith('/ventas');
  const isCustodiasActive = location.pathname.startsWith('/custodias');

  const navItems = [
    { label: 'Inicio', path: '/dashboard', icon: '⌂', show: true },
    { label: 'Proyectos', path: '/projects', icon: '📁', show: canView('PROJECTS') },
    { label: 'Administración', path: '/admin', icon: '👥', show: canView('ADMIN') },
    { label: 'Empresas', path: '/admin/companies', icon: '🏢', show: isSuperAdmin && canView('COMPANIES') },
    { label: 'Mi Empresa', path: '/admin/company-settings', icon: '🎨', show: isCompanyAdmin && canView('COMPANY_SETTINGS') },
    { label: 'Herramientas', path: '/tools', icon: '🔧', show: canView('TOOLS') },
    { label: 'Agentes', path: '/admin/agents', icon: '🤖', show: canView('AGENTS') },
    { label: 'Cacao', path: '/cacao', icon: '🫘', show: canView('CACAO') },
    { label: 'Permisos', path: '/admin/permissions', icon: '🔐', show: isSuperAdmin },
    { label: 'Permisos Usuarios', path: '/admin/user-permissions', icon: '🔑', show: isCompanyAdmin },
  ];

  const personalMainItems = [
    { label: 'Dashboard', path: '/personal', icon: '📊' },
    { label: 'Reclutamiento', path: '/personal/reclutamiento', icon: '🎯' },
    { label: 'Personal Administrativo', path: '/personal/administrativo', icon: '📋' },
  ];

  const custodiosItems = [
    { label: 'Listado de Guardias', path: '/personal/guardias', icon: '👮' },
    { label: 'Certificaciones', path: '/personal/certifications', icon: '🎓' },
    { label: 'Contratos', path: '/personal/contracts', icon: '📄' },
    { label: 'Cumplimiento', path: '/personal/compliance', icon: '🔍' },
    { label: 'Verificación SUT/SICOSEP', path: '/personal/verificacion', icon: '✅' },
  ];

  const bitacorasItems = [
    { label: 'Bitácoras', path: '/personal/logs', icon: '📝' },
  ];

  const configItems = [
    { label: 'Configurar Drive', path: '/personal/drive-config', icon: '☁️' },
    { label: 'Requisitos', path: '/personal/document-types', icon: '⚙️' },
  ];

  const ventasItems = [
    { label: 'Dashboard', path: '/ventas', icon: '📊' },
    { label: 'Planificación y Campo', path: '/ventas/visitas', icon: '📍' },
    { label: 'Prospectos CRM', path: '/ventas/leads', icon: '🎯' },
    { label: 'Reportes', path: '/ventas/reportes', icon: '📈' },
    { label: 'Config Webhook', path: '/ventas/webhook-config', icon: '⚙️' },
  ];

  const custodiasSubItems = [
    { label: 'Dashboard Operativo', path: '/custodias/dashboard', icon: '📊' },
    { label: 'Lista de Operaciones', path: '/custodias', icon: '📋' },
    { label: 'Nueva Custodia', path: '/custodias/new', icon: '➕' },
    { label: 'Nómina y Liquidación', path: '/custodias/nomina', icon: '💰' },
    { label: 'Consulta por Cédula', path: '/custodias/trabajador', icon: '🔍' },
    { label: 'Asistente GEME-BOT', path: '/custodias/gemebot', icon: '🤖' },
  ];

  const renderSubItems = (items: { label: string; path: string; icon: string }[], depth: number = 0) => (
    items.map((child) => (
      <button
        key={child.path}
        className={`sidebar-link sidebar-link-sub ${isActive(child.path) ? 'sidebar-link-active' : ''}`}
        onClick={() => navigate(child.path)}
        style={{ fontSize: '0.82rem', padding: `7px 12px 7px ${16 + depth * 16}px` }}
      >
        <span className="sidebar-icon" style={{ fontSize: '0.85rem' }}>{child.icon}</span>
        <span className="sidebar-label">{child.label}</span>
      </button>
    ))
  );

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand" onClick={() => navigate('/dashboard')}>
            {theme.logoUrl && (
              <img
                src={theme.logoUrl}
                alt={theme.name}
                className="sidebar-logo-img"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <span className="sidebar-brand-text">{theme.name}</span>
          </div>
        )}
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'}>
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.filter(item => item.show).map(item => (
          <button
            key={item.path}
            className={`sidebar-link ${isActive(item.path) ? 'sidebar-link-active' : ''}`}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-label">{item.label}</span>}
          </button>
        ))}

        {canView('PERSONAL') && (
          <>
            <button
              className={`sidebar-link ${isPersonalActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/personal');
                } else {
                  setPersonalOpen(!personalOpen);
                  if (!personalOpen) navigate('/personal');
                }
              }}
              title={collapsed ? 'Personal' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">👤</span>
                {!collapsed && <span className="sidebar-label">Personal</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: personalOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && personalOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(personalMainItems)}

                <button
                  className={`sidebar-link sidebar-link-sub ${custodiosItems.some(i => isActive(i.path)) ? 'sidebar-link-active' : ''}`}
                  onClick={() => setCustodiosOpen(!custodiosOpen)}
                  style={{ fontSize: '0.82rem', padding: '7px 12px 7px 16px', justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="sidebar-icon" style={{ fontSize: '0.85rem' }}>🛡️</span>
                    <span className="sidebar-label">Guardias</span>
                  </span>
                  <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: custodiosOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ▶
                  </span>
                </button>
                {custodiosOpen && renderSubItems(custodiosItems, 1)}

                {renderSubItems(bitacorasItems)}

                <button
                  className={`sidebar-link sidebar-link-sub ${configItems.some(i => isActive(i.path)) ? 'sidebar-link-active' : ''}`}
                  onClick={() => setConfigOpen(!configOpen)}
                  style={{ fontSize: '0.82rem', padding: '7px 12px 7px 16px', justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="sidebar-icon" style={{ fontSize: '0.85rem' }}>⚙️</span>
                    <span className="sidebar-label">Configuración</span>
                  </span>
                  <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: configOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ▶
                  </span>
                </button>
                {configOpen && renderSubItems(configItems, 1)}
              </div>
            )}
          </>
        )}

        {canView('CUSTODIAS') && (
          <>
            <button
              className={`sidebar-link ${isCustodiasActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/custodias');
                } else {
                  setCustodiasOpen(!custodiasOpen);
                  if (!custodiasOpen) navigate('/custodias');
                }
              }}
              title={collapsed ? 'Custodias' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">🛡️</span>
                {!collapsed && <span className="sidebar-label">Custodias</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: custodiasOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && custodiasOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(custodiasSubItems)}
              </div>
            )}
          </>
        )}

        {canView('VENTAS') && (
          <>
            <button
              className={`sidebar-link ${isVentasActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/ventas');
                } else {
                  setVentasOpen(!ventasOpen);
                  if (!ventasOpen) navigate('/ventas');
                }
              }}
              title={collapsed ? 'Ventas' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">💼</span>
                {!collapsed && <span className="sidebar-label">Ventas y CRM</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: ventasOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && ventasOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(ventasItems)}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && user && (
          <div className="sidebar-user" onClick={() => navigate('/profile')}>
            <div className="sidebar-avatar">{user.fullName.charAt(0)}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.fullName}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
          </div>
        )}
        <button className="sidebar-logout" onClick={handleLogout} title="Cerrar sesión">
          <span className="sidebar-icon">⏻</span>
          {!collapsed && <span className="sidebar-label">Salir</span>}
        </button>
      </div>
    </aside>
  );
}
