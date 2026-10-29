import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUser, removeToken } from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';
import { usePerm } from '../../contexts/PermissionsContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { getBitacoraEstado, type EstadoBitacora } from '../../services/bitacora.service';

interface SubItem {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
  /** Título (no clicable) que se pinta justo antes de este ítem y abre un grupo. */
  grupo?: string;
  /** Línea que separa este ítem de los anteriores. */
  separadorAntes?: boolean;
}

// «Planificación y Campo» (visitas de campo): ENCENDIDA el 2026-10-23 por decisión de la usuaria. Hasta entonces
// estuvo en gris («Próximamente»). Para apagarla otra vez basta ponerla en false (el ítem vuelve a gris y
// sin clic); la ruta /ventas/visitas de App.tsx queda registrada.
const PLANIFICACION_Y_CAMPO_ACTIVA = true;

// Mismo corte que el @media (max-width: 768px) de styles.css.
const MOBILE_QUERY = '(max-width: 768px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useCompany();
  const { canView, canWrite, isSuperAdmin, sections, permissions, error: permError, reload: reloadPerms } = usePerm();
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const isCompanyAdmin = isAdmin && !!user?.companyId;
  // El Gerente ve en solo lectura las pantallas administrativas de su empresa.
  const isManager = user?.role === 'MANAGER';
  const { collapsed: collapsedPref, setCollapsed } = useSidebar();
  // Colapsar a iconos es una preferencia de escritorio (se guarda en
  // localStorage). En movil el cajon siempre va expandido: si se respetara,
  // quedaria solo con iconos y sin boton para volver a expandirlo.
  const isMobile = useIsMobile();
  const collapsed = collapsedPref && !isMobile;
  // En movil el sidebar es un cajon deslizante: arranca cerrado para no
  // tapar el contenido, y se cierra solo al navegar.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [custodiosOpen, setCustodiosOpen] = useState(false);
  const [ventasOpen, setVentasOpen] = useState(false);
  // Abierto desde el inicio si se entra directo a una pantalla de Cacao (si no, se veía cerrado y sin pista de dónde estás).
  const [cacaoOpen, setCacaoOpen] = useState(() => location.pathname.startsWith('/cacao'));
  const [custodiasOpen, setCustodiasOpen] = useState(false);
  const [sistemasOpen, setSistemasOpen] = useState(false);
  const [contratacionPublicaOpen, setContratacionPublicaOpen] = useState(false);
  const [bitacoraOpen, setBitacoraOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Bitácora del equipo: qué ve esta persona en el menú depende de si su empresa la tiene encendida y de si a
  // ella le activaron la hoja o puede activar hojas. Se vuelve a pedir al entrar a las pantallas de la bitácora
  // (ahí es donde cambia), no en cada navegación.
  const bitacoraEnEmpresa = !isSuperAdmin && sections.includes('BITACORA');
  const enBitacora = location.pathname.startsWith('/bitacora');
  const [bitacora, setBitacora] = useState<EstadoBitacora | null>(null);
  useEffect(() => {
    if (!bitacoraEnEmpresa) {
      setBitacora(null);
      return;
    }
    let vigente = true;
    getBitacoraEstado()
      .then((e) => vigente && setBitacora(e))
      .catch(() => vigente && setBitacora(null));
    return () => {
      vigente = false;
    };
  }, [bitacoraEnEmpresa, enBitacora]);
  // Quien llega a una pantalla de la Bitácora (por un aviso de la campana, por ejemplo) la ve abierta en el menú.
  useEffect(() => { if (enBitacora) setBitacoraOpen(true); }, [enBitacora]);

  const handleLogout = () => {
    removeToken();
    localStorage.removeItem('company_theme');
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isPersonalActive = location.pathname.startsWith('/rrhh');
  const isVentasActive = location.pathname.startsWith('/ventas');
  const isCacaoActive = location.pathname.startsWith('/cacao');
  const isCustodiasActive = location.pathname.startsWith('/custodias');
  const isSistemasActive = location.pathname.startsWith('/sistemas');
  const isContratacionPublicaActive = location.pathname.startsWith('/contratacion-publica');
  const isBitacoraActive = location.pathname.startsWith('/bitacora');

  const navItems = [
    { label: 'Inicio', path: '/dashboard', icon: '⌂', show: true },
    { label: 'Buzón de Quejas y Sugerencias', path: '/rrhh/quejas', icon: '📮', show: true },
    { label: 'Encuestas', path: '/rrhh/encuestas', icon: '📝', show: true },
    { label: 'Proyectos', path: '/projects', icon: '📁', show: canView('PROJECTS') },
    { label: 'Administración', path: '/admin', icon: '👥', show: canView('ADMIN') && (isAdmin || isManager) },
    { label: 'Empresas', path: '/admin/companies', icon: '🏢', show: isSuperAdmin && canView('COMPANIES') },
    { label: 'Mi Empresa', path: '/admin/company-settings', icon: '🎨', show: (isCompanyAdmin || isManager) && canView('COMPANY_SETTINGS') },
    { label: 'Permisos', path: '/admin/permissions', icon: '🔐', show: isSuperAdmin },
    { label: 'Permisos Usuarios', path: '/admin/user-permissions', icon: '🔑', show: isCompanyAdmin || isManager },
  ];

  // Bitácora (2026-10-27): módulo propio con submenú. Por defecto NADIE tiene hoja, y cada persona ve solo lo
  // suyo: «Dashboard» (métricas) y «Actividad del día» (el detalle de un día) solo quien tenga fila de permiso
  // con «Ver» (sección cerrada por defecto), «Mi hoja del día» quien la tiene o la tuvo activada, y
  // «Configuración» los administradores y gerentes. Si no le toca ninguna, el módulo no aparece.
  const verBitacoraDelEquipo = bitacoraEnEmpresa && !!permissions['BITACORA']?.canView;
  const bitacoraItems: SubItem[] = [
    ...(verBitacoraDelEquipo
      ? [
          { label: 'Dashboard', path: '/bitacora', icon: '📊' },
          { label: 'Actividad del día', path: '/bitacora/actividad', icon: '📅' },
        ]
      : []),
    ...(bitacora?.registrada ? [{ label: 'Mi hoja del día', path: '/bitacora/mi-hoja', icon: '🗒️' }] : []),
    ...(bitacora?.puedeAdministrar
      ? [{ label: 'Configuración', path: '/bitacora/configuracion', icon: '⚙️', separadorAntes: true }]
      : []),
  ];

  const personalMainItems = [
    { label: 'Dashboard', path: '/rrhh', icon: '📊' },
    { label: 'Reclutamiento', path: '/rrhh/reclutamiento', icon: '🎯' },
    { label: 'Personal Administrativo', path: '/rrhh/administrativo', icon: '📋' },
    { label: 'Capacitaciones', path: '/rrhh/capacitaciones', icon: '🎓' },
    { label: 'Gestión de Quejas y Sugerencias', path: '/rrhh/quejas/gestion', icon: '📮' },
    { label: 'Gestión de Encuestas', path: '/rrhh/encuestas/gestion', icon: '📝' },
  ];

  const custodiosItems = [
    { label: 'Listado de Guardias', path: '/rrhh/guardias', icon: '👮' },
    { label: 'Contratos', path: '/rrhh/contracts', icon: '📄' },
    { label: 'Entidades y Requisitos', path: '/rrhh/entidades', icon: '🏢' },
    { label: 'Cumplimiento', path: '/rrhh/cumplimiento', icon: '📊' },
    { label: 'Historial', path: '/rrhh/historial', icon: '🔄' },
  ];

  // "Bitácoras" (plantillas de texto libre para dejar constancia de permisos,
  // novedades y respuestas administrativas por guardia) se quitaron del menú
  // a pedido del cliente: no se estaban usando. Se eliminaron por completo el
  // 2026-09-22 (código y tablas, ver .agents/modules/recursos-humanos.md
  // punto 16a).

  // Ventas/CRM: Dashboard, Posibles clientes, Oportunidades, Directorio, Contratos, Documentación y Configuración están activos.
  // Desde 2026-10-16 los nombres de pantalla son los que conoce Ventas desde Zoho
  // (Leads -> Posibles clientes, Clientes -> Directorio; Documentación se queda
  // igual). Las URLs NO cambiaron (/ventas/leads, /ventas/clientes,
  // /ventas/documentacion): hay notificaciones guardadas que apuntan a ellas.
  // Planificación y Campo está activa desde 2026-10-23 (ver PLANIFICACION_Y_CAMPO_ACTIVA arriba).
  // «Reportes» se quitó del menú (2026-10-08): sus cifras de visitas viven en la pestaña
  // «Resultados» de VisitasPage y el embudo de marketing, en el Dashboard. Tampoco las conoce el
  // asistente de IA (system-guide.util.ts / ai.processor.ts). Al reactivar uno, hay que
  // devolverle la ruta en App.tsx, quitar `disabled` aquí y explicarlo en la guía del asistente.
  // Agrupado «por etapa de la venta» (2026-10-20, opción A elegida por la usuaria): Captar ->
  // Negociar -> Cerrar. Directorio y Configuración no son una etapa: van al final, bajo una línea.
  // `grupo` pinta un título (no clicable) antes del ítem; `separadorAntes` una línea.
  const ventasItems: SubItem[] = [
    { label: 'Dashboard', path: '/ventas', icon: '📊' },
    { label: 'Posibles clientes', path: '/ventas/leads', icon: '📥', grupo: 'Captar' },
    { label: 'Oportunidades', path: '/ventas/oportunidades', icon: '🎯', grupo: 'Negociar' },
    { label: 'Planificación y Campo', path: '/ventas/visitas', icon: '📍', disabled: !PLANIFICACION_Y_CAMPO_ACTIVA },
    { label: 'Cotizador', path: '/ventas/cotizador', icon: '🧾' },
    { label: 'Contratos', path: '/ventas/contratos', icon: '📑', grupo: 'Cerrar' },
    { label: 'Documentación', path: '/ventas/documentacion', icon: '📄' },
    { label: 'Directorio', path: '/ventas/clientes', icon: '👤', separadorAntes: true },
    { label: 'Configuración', path: '/ventas/configuracion', icon: '⚙️' },
  ];

  // Cacao: el Dashboard va primero (regla de todos los módulos) y luego el orden en que fluye el negocio,
  // agrupado como Ventas: Compra → Venta. Configuración (calidades, unidades y plazos de la empresa) va al
  // final, bajo una línea. Desde 2026-10-23 Cacao tiene su propio menú desplegable; antes era una sola
  // entrada y todo se navegaba desde el Dashboard. Las URLs no cambiaron.
  const cacaoItems: SubItem[] = [
    { label: 'Dashboard', path: '/cacao', icon: '📊' },
    { label: 'Proveedores', path: '/cacao/suppliers', icon: '🤝', grupo: 'Compra' },
    { label: 'Recepciones', path: '/cacao/receptions', icon: '🚚' },
    { label: 'Lotes', path: '/cacao/lots', icon: '📦' },
    { label: 'Fijaciones de precio', path: '/cacao/price-fixings', icon: '💲' },
    { label: 'Liquidaciones', path: '/cacao/settlements', icon: '🧾' },
    { label: 'Cuentas por pagar', path: '/cacao/payables', icon: '📤' },
    { label: 'Clientes', path: '/cacao/clients', icon: '🏢', grupo: 'Venta' },
    { label: 'Embarques', path: '/cacao/shipments', icon: '🚢' },
    { label: 'Cuentas por cobrar', path: '/cacao/receivables', icon: '💵' },
    { label: 'Reportes', path: '/cacao/reportes', icon: '📈', grupo: 'Análisis' },
    { label: 'Configuración', path: '/cacao/configuracion', icon: '⚙️', separadorAntes: true },
    { label: 'Guía del módulo', path: '/cacao/guia', icon: '📖' },
  ];

  const custodiasSubItems = [
    { label: 'Dashboard Operativo', path: '/custodias/dashboard', icon: '📊' },
    { label: 'Lista de Operaciones', path: '/custodias', icon: '📋' },
    { label: 'Nueva Custodia', path: '/custodias/new', icon: '➕' },
    { label: 'Nómina y Liquidación', path: '/custodias/nomina', icon: '💰' },
    { label: 'Consulta por Cédula', path: '/custodias/trabajador', icon: '🔍' },
    { label: 'Asistente GEME-BOT', path: '/custodias/gemebot', icon: '🤖' },
  ];

  // Contratación Pública: Entidades Públicas con sus entregas de documentos, y desde
  // 2026-10-18 las Operaciones (Contratos, Horarios, Códigos de turno y Bitácoras, que
  // compara las hojas de los guardias con el horario). Informes y Textos Institucionales
  // siguen ocultos (ver CP_MOSTRAR_SUBMODULOS_OCULTOS y CP_MOSTRAR_OPERACIONES en App.tsx).
  const contratacionPublicaItems = [
    { label: 'Entidades Públicas', path: '/contratacion-publica/entidades', icon: '🏛️' },
    // Solo el personal de Contratación Pública aprueba; el resto tiene "Por entregar".
    ...(canWrite('CONTRATACION_PUBLICA')
      ? [{ label: 'Por aprobar', path: '/contratacion-publica/por-revisar', icon: '🔎' }]
      : []),
    { label: 'Por entregar', path: '/contratacion-publica/mis-documentos', icon: '📥' },
    { label: 'Contratos', path: '/contratacion-publica/contratos', icon: '📑' },
    { label: 'Horarios', path: '/contratacion-publica/horarios', icon: '🗓️' },
    { label: 'Códigos de turno', path: '/contratacion-publica/config/codigos-turno', icon: '🏷️' },
    { label: 'Bitácoras', path: '/contratacion-publica/bitacoras', icon: '📒' },
  ];

  const sistemasSubItems = [
    { label: 'Dashboard', path: '/sistemas/dashboard', icon: '📊' },
    { label: 'Herramientas', path: '/sistemas/herramientas', icon: '🔧' },
    { label: 'Agentes', path: '/sistemas/agentes', icon: '🤖' },
    { label: 'Base de Conocimiento', path: '/sistemas/base-conocimiento', icon: '📚' },
    { label: 'Soporte Técnico', path: '/sistemas/soporte', icon: '🛠️' },
    { label: 'Novedades', path: '/sistemas/novedades', icon: '📣' },
  ];

  // Dentro de un submenú se marca UN solo ítem: el de la ruta más específica. Sin esto,
  // «Dashboard» (/ventas) quedaba marcado también en /ventas/leads, porque es prefijo de ella;
  // lo mismo pasaba con «Lista de Operaciones» (/custodias) y sus hermanas.
  const renderSubItems = (items: SubItem[], depth: number = 0) => {
    const activePath = items
      .filter((i) => isActive(i.path))
      .reduce<string | null>((best, i) => (best === null || i.path.length > best.length ? i.path : best), null);
    return items.map((child) => (
      <Fragment key={child.path}>
      {child.separadorAntes && <div className="sidebar-sub-separador" role="separator" />}
      {child.grupo && <div className="sidebar-sub-grupo" role="presentation">{child.grupo}</div>}
      <button
        className={`sidebar-link sidebar-link-sub ${child.path === activePath ? 'sidebar-link-active' : ''}`}
        onClick={child.disabled ? undefined : () => navigate(child.path)}
        disabled={child.disabled}
        aria-disabled={child.disabled}
        title={child.disabled ? 'Próximamente' : undefined}
        style={{
          fontSize: '0.82rem',
          padding: `7px 6px 7px ${16 + depth * 16}px`,
          ...(child.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
        }}
      >
        <span className="sidebar-icon" style={{ fontSize: '0.85rem' }}>{child.icon}</span>
        <span className="sidebar-label">{child.label}</span>
      </button>
      </Fragment>
    ));
  };

  return (
    <>
      {/* Con el cajon abierto el boton taparia el logo; cerrar se hace
          tocando el fondo o navegando. */}
      {!mobileOpen && (
        <button
          className="sidebar-fab"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          ☰
        </button>
      )}
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menu"
        />
      )}
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
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
          </div>
        )}
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'}>
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {permError && !collapsed && (
          <div className="sidebar-perm-error" role="alert">
            No se pudieron cargar todos tus módulos.
            <button type="button" onClick={() => reloadPerms()}>Reintentar</button>
          </div>
        )}
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

        {canView('RRHH') && (
          <>
            <button
              className={`sidebar-link ${isPersonalActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/rrhh');
                } else {
                  setPersonalOpen(!personalOpen);
                  if (!personalOpen) navigate('/rrhh');
                }
              }}
              title={collapsed ? 'Recursos Humanos' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">👤</span>
                {!collapsed && <span className="sidebar-label">Recursos Humanos</span>}
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
                  navigate('/ventas/clientes');
                } else {
                  setVentasOpen(!ventasOpen);
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

        {canView('CACAO') && (
          <>
            <button
              className={`sidebar-link ${isCacaoActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/cacao');
                } else {
                  setCacaoOpen(!cacaoOpen);
                  if (!cacaoOpen) navigate('/cacao');
                }
              }}
              title={collapsed ? 'Cacao' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">🫘</span>
                {!collapsed && <span className="sidebar-label">Cacao</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: cacaoOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && cacaoOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(cacaoItems)}
              </div>
            )}
          </>
        )}

        {canView('CONTRATACION_PUBLICA') && (
          <>
            <button
              className={`sidebar-link ${isContratacionPublicaActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/contratacion-publica/entidades');
                } else {
                  setContratacionPublicaOpen(!contratacionPublicaOpen);
                  if (!contratacionPublicaOpen) navigate('/contratacion-publica/entidades');
                }
              }}
              title={collapsed ? 'Contratación Pública' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">🏛️</span>
                {!collapsed && <span className="sidebar-label">Contratación Pública</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: contratacionPublicaOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && contratacionPublicaOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(contratacionPublicaItems)}
              </div>
            )}
          </>
        )}

        {canView('SISTEMAS') && (
          <>
            <button
              className={`sidebar-link ${isSistemasActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate('/sistemas/dashboard');
                } else {
                  setSistemasOpen(!sistemasOpen);
                  if (!sistemasOpen) navigate('/sistemas/dashboard');
                }
              }}
              title={collapsed ? 'Sistemas' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">🛠️</span>
                {!collapsed && <span className="sidebar-label">Sistemas</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: sistemasOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && sistemasOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(sistemasSubItems)}
              </div>
            )}
          </>
        )}

        {bitacoraItems.length > 0 && (
          <>
            <button
              className={`sidebar-link ${isBitacoraActive ? 'sidebar-link-active' : ''}`}
              onClick={() => {
                if (collapsed) {
                  navigate(bitacoraItems[0].path);
                } else {
                  setBitacoraOpen(!bitacoraOpen);
                  if (!bitacoraOpen && !isBitacoraActive) navigate(bitacoraItems[0].path);
                }
              }}
              title={collapsed ? 'Bitácora' : undefined}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="sidebar-icon">🧭</span>
                {!collapsed && <span className="sidebar-label">Bitácora</span>}
              </span>
              {!collapsed && (
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: bitacoraOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  ▶
                </span>
              )}
            </button>

            {!collapsed && bitacoraOpen && (
              <div style={{ marginLeft: '12px', borderLeft: '2px solid #e2e8f0', paddingLeft: '0' }}>
                {renderSubItems(bitacoraItems)}
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
              {/* El CARGO de la persona, no su rol del sistema. "EMPLOYEE"
                   debajo del nombre no le decía nada a nadie. Si todavía no
                   tiene cargo cargado se muestra el correo, que al menos
                   sirve para saber con qué cuenta se entró. */}
              <div className="sidebar-user-role">{user.position || user.email}</div>
            </div>
          </div>
        )}
        <button className="sidebar-logout" onClick={handleLogout} title="Cerrar sesión">
          <span className="sidebar-icon">⏻</span>
          {!collapsed && <span className="sidebar-label">Salir</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
