import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import ProjectsListPage from './pages/projects/ProjectsListPage';
import CreateProjectPage from './pages/projects/CreateProjectPage';
import ProjectDetailPage from './pages/projects/ProjectDetailPage';
import KanbanPage from './pages/tasks/KanbanPage';
import CreateTaskPage from './pages/tasks/CreateTaskPage';
import TaskDetailPage from './pages/tasks/TaskDetailPage';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/layout/Sidebar';
import ChatFloatingButton from './components/chat/ChatFloatingButton';
import ChatDrawer from './components/chat/ChatDrawer';
import ReportarProblemaButton from './components/common/ReportarProblemaButton';
import NotificationsBell from './components/common/NotificationsBell';
import { CompanyProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { usePerm } from './contexts/PermissionsContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import { usePermissions } from './hooks/usePermissions';
import { isAuthenticated } from './services/auth.service';

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const CompaniesPage = lazy(() => import('./pages/admin/CompaniesPage'));
const CompanySettingsPage = lazy(() => import('./pages/admin/CompanySettingsPage'));
const ToolsPage = lazy(() => import('./pages/tools/ToolsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const AgentsPage = lazy(() => import('./pages/admin/AgentsPage'));
const KnowledgeBasePage = lazy(() => import('./pages/sistemas/KnowledgeBasePage'));
const SuperAdminPermissions = lazy(() => import('./pages/admin/SuperAdminPermissions'));
const CompanyAdminPermissions = lazy(() => import('./pages/admin/CompanyAdminPermissions'));
const CacaoDashboard = lazy(() => import('./pages/cacao/CacaoDashboard'));
const CacaoHelpGuide = lazy(() => import('./pages/cacao/CacaoHelpGuide'));
const SuppliersPage = lazy(() => import('./pages/cacao/suppliers/SuppliersPage'));
const ClientsPage = lazy(() => import('./pages/cacao/clients/ClientsPage'));
const ReceptionsList = lazy(() => import('./pages/cacao/receptions/ReceptionsList'));
const ReceptionForm = lazy(() => import('./pages/cacao/receptions/ReceptionForm'));
const LotsList = lazy(() => import('./pages/cacao/lots/LotsList'));
const LotDetail = lazy(() => import('./pages/cacao/lots/LotDetail'));
const SettlementsList = lazy(() => import('./pages/cacao/settlements/SettlementsList'));
const SettlementForm = lazy(() => import('./pages/cacao/settlements/SettlementForm'));
const SettlementDetail = lazy(() => import('./pages/cacao/settlements/SettlementDetail'));
const PriceFixingsList = lazy(() => import('./pages/cacao/price-fixings/PriceFixingsList'));
const ShipmentsList = lazy(() => import('./pages/cacao/shipments/ShipmentsList'));
const ShipmentForm = lazy(() => import('./pages/cacao/shipments/ShipmentForm'));
const ShipmentDetail = lazy(() => import('./pages/cacao/shipments/ShipmentDetail'));
const PayablesList = lazy(() => import('./pages/cacao/payables/PayablesList'));
const ReceivablesList = lazy(() => import('./pages/cacao/receivables/ReceivablesList'));
const QualitiesPage = lazy(() => import('./pages/cacao/qualities/QualitiesPage'));
const CustodiasList = lazy(() => import('./pages/custodias/CustodiasList'));
const CustodiaForm = lazy(() => import('./pages/custodias/CustodiaForm'));
const NominaPage = lazy(() => import('./pages/custodias/NominaPage'));
const CustodiasDashboard = lazy(() => import('./pages/custodias/CustodiasDashboard'));
const ConsultaTrabajador = lazy(() => import('./pages/custodias/ConsultaTrabajador'));
const GemeBotChat = lazy(() => import('./pages/custodias/GemeBotChat'));
const CPEntidadesPublicasList = lazy(() => import('./pages/contratacion-publica/EntidadesPublicasList'));
const CPEntidadDetail = lazy(() => import('./pages/contratacion-publica/entidades/EntidadDetail'));
const CPMisDocumentos = lazy(() => import('./pages/contratacion-publica/MisDocumentosPage'));
const CPPorRevisar = lazy(() => import('./pages/contratacion-publica/PorRevisarPage'));
const CPContratosList = lazy(() => import('./pages/contratacion-publica/contratos/ContratosList'));
const CPContratoForm = lazy(() => import('./pages/contratacion-publica/contratos/ContratoForm'));
const CPContratoDetail = lazy(() => import('./pages/contratacion-publica/contratos/ContratoDetail'));
const CPHorarioMensualList = lazy(() => import('./pages/contratacion-publica/horarios/HorarioMensualList'));
const CPHorarioMensualEditor = lazy(() => import('./pages/contratacion-publica/horarios/HorarioMensualEditor'));
const CPInformesList = lazy(() => import('./pages/contratacion-publica/informes/InformesList'));
const CPInformeForm = lazy(() => import('./pages/contratacion-publica/informes/InformeForm'));
const CPCodigosTurnoConfig = lazy(() => import('./pages/contratacion-publica/config/CodigosTurnoConfig'));
const CPTextosInstitucionalesConfig = lazy(() => import('./pages/contratacion-publica/config/TextosInstitucionalesConfig'));

// Contratación Pública: desde 2026-10-01 solo está visible "Entidades Públicas"
// (con el seguimiento de entregas de documentos). Contratos, Horarios, Informes,
// Códigos de Turno y Textos Institucionales siguen en el código pero están
// ocultos, y sus rutas redirigen a Entidades Públicas. Para reactivarlos: poner
// esta bandera en true y devolver los ítems en Sidebar.tsx (contratacionPublicaItems).
// Ver "Submódulos ocultos" en .agents/modules/contratacion-publica.md.
const CP_MOSTRAR_SUBMODULOS_OCULTOS = false;
const PersonalDashboard = lazy(() => import('./pages/personal/PersonalDashboard'));
const ReclutamientoPage = lazy(() => import('./pages/personal/ReclutamientoPage'));
const GuardiasList = lazy(() => import('./pages/personal/GuardiasList'));
const AdministrativeStaff = lazy(() => import('./pages/personal/AdministrativeStaff'));
const ContractsList = lazy(() => import('./pages/personal/contracts/ContractsList'));
const ContractTemplateConfig = lazy(() => import('./pages/personal/contracts/ContractTemplateConfig'));
const GenerarDocumento = lazy(() => import('./pages/personal/contracts/GenerarDocumento'));
const EntidadesList = lazy(() => import('./pages/personal/entidades/EntidadesList'));
const HistorialGuardia = lazy(() => import('./pages/personal/entidades/HistorialGuardia'));
const CumplimientoEntidades = lazy(() => import('./pages/personal/entidades/CumplimientoEntidades'));
const TrainingsPage = lazy(() => import('./pages/personal/TrainingsPage'));
const ComplaintsPage = lazy(() => import('./pages/personal/ComplaintsPage'));
const ComplaintsManagementPage = lazy(() => import('./pages/personal/ComplaintsManagementPage'));
const SurveysPage = lazy(() => import('./pages/personal/SurveysPage'));
const PublicSurveyPage = lazy(() => import('./pages/personal/PublicSurveyPage'));
const SurveyManagementPage = lazy(() => import('./pages/personal/SurveyManagementPage'));
const VentasDashboard = lazy(() => import('./pages/ventas/VentasDashboard'));
const VentasClientesPage = lazy(() => import('./pages/ventas/VentasClientesPage'));
const TemplateList = lazy(() => import('./pages/ventas/TemplateList'));
const TemplateConfig = lazy(() => import('./pages/ventas/TemplateConfig'));
const ContratosList = lazy(() => import('./pages/ventas/ContratosList'));
const ContratoForm = lazy(() => import('./pages/ventas/ContratoForm'));
const ContratoResult = lazy(() => import('./pages/ventas/ContratoResult'));
const CompletarContrato = lazy(() => import('./pages/ventas/CompletarContrato'));
const SoporteTecnicoPage = lazy(() => import('./pages/sistemas/SoporteTecnicoPage'));
const SistemasDashboardPage = lazy(() => import('./pages/sistemas/SistemasDashboardPage'));
const NovedadesPage = lazy(() => import('./pages/sistemas/NovedadesPage'));

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <ProtectedRoute>
      <div className="no-print"><Sidebar /></div>
      <div className={`main-content${collapsed ? ' content-expanded' : ''}`}>
        {children}
      </div>
      <div className="no-print"><ReportarProblemaButton /></div>
      <div className="no-print"><NotificationsBell /></div>
    </ProtectedRoute>
  );
}

function SectionRoute({ section, children }: { section: string; children: React.ReactNode }) {
  const { canView, loading, landingRoute } = usePerm();
  if (loading) return <LoadingFallback />;
  if (!canView(section)) {
    // Se redirige a la primera seccion que este usuario SI puede ver, nunca
    // a una fija. Antes esto mandaba siempre a /dashboard, y como el
    // Dashboard tambien es una seccion que se puede negar por usuario, a
    // quien la tuviera en "no" lo dejaba en un bucle de redirecciones con la
    // pantalla en blanco (reportado por el usuario: "a unas cuentas les sale
    // el bienvenido y a otras no").
    if (!landingRoute) return <SinSeccionesDisponibles />;
    return <Navigate to={landingRoute} replace />;
  }
  return <>{children}</>;
}

// Caso límite: a este usuario le negaron TODAS las secciones. Sin esto
// quedaría en un bucle de redirecciones sin explicación.
function SinSeccionesDisponibles() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#1a202c', marginBottom: 8 }}>
          Tu usuario todavía no tiene ningún módulo habilitado
        </h2>
        <p style={{ color: '#718096', fontSize: '0.9rem', margin: 0 }}>
          Pídele al administrador de tu empresa que te active al menos una
          sección desde Administración &rarr; Permisos de usuario.
        </p>
      </div>
    </div>
  );
}

// Cuando el backend lleva un rato sin tráfico, Cloud Run lo apaga y la primera
// petición del día espera su arranque en frío (en producción: ~15-20 s, con
// picos de más de un minuto). Antes la pantalla se quedaba en un "Cargando..."
// mudo y parecía que la app se había roto. La espera se explica por etapas; la
// petición en curso NO se toca (no hay timeout: operaciones como la
// sincronización con Drive tardan legítimamente más de 30 s).
const ESPERA_AVISO_MS = 4_000;
const ESPERA_LARGA_MS = 15_000;
const ESPERA_SIN_RESPUESTA_MS = 45_000;

function LoadingFallback() {
  const [etapa, setEtapa] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setEtapa(1), ESPERA_AVISO_MS),
      setTimeout(() => setEtapa(2), ESPERA_LARGA_MS),
      setTimeout(() => setEtapa(3), ESPERA_SIN_RESPUESTA_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const textos = [
    { titulo: 'Cargando...', detalle: null },
    {
      titulo: 'Preparando tu espacio de trabajo…',
      detalle: 'La primera vez del día toma unos segundos.',
    },
    {
      titulo: 'Esto está tardando más de lo normal.',
      detalle: 'Sigue en marcha, no cierres esta ventana.',
    },
    {
      titulo: 'Todavía no logramos conectar.',
      detalle: 'Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, escribe a Sistemas.',
    },
  ][etapa];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#718096' }}>
      <div role="status" aria-live="polite" style={{ textAlign: 'center', maxWidth: 360, padding: '0 16px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'spin 1s linear infinite' }}>&#8635;</div>
        <div>{textos.titulo}</div>
        {textos.detalle && (
          <div style={{ fontSize: '0.85rem', marginTop: 6, color: '#a0aec0' }}>{textos.detalle}</div>
        )}
        {etapa === 3 && (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 16, padding: '10px 20px', fontSize: '0.9rem', border: '1px solid #cbd5e0' }}
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

// La raíz manda a la primera sección que el usuario puede ver, no a
// /dashboard fijo (ver SectionRoute).
function RootRedirect() {
  const { loading, landingRoute } = usePerm();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (loading) return <LoadingFallback />;
  if (!landingRoute) {
    return (
      <ProtectedLayout>
        <SinSeccionesDisponibles />
      </ProtectedLayout>
    );
  }
  return <Navigate to={landingRoute} replace />;
}

function AppInner() {
  const perms = usePermissions();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <PermissionsProvider value={perms}>
      <SidebarProvider>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/ventas/contratos/completar/:token" element={<CompletarContrato />} />
        {/* Encuesta por enlace público: la responde gente SIN cuenta (incluido
            desde el celular), por eso va fuera de ProtectedLayout y sin
            SectionRoute. El token de la URL es la única credencial. */}
        <Route path="/encuesta/:token" element={<PublicSurveyPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <SectionRoute section="DASHBOARD"><DashboardPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><ProjectsListPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/new"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><CreateProjectPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><ProjectDetailPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id/tasks"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><KanbanPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id/tasks/new"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><CreateTaskPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><TaskDetailPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks/new"
          element={
            <ProtectedLayout>
              <SectionRoute section="PROJECTS"><CreateTaskPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedLayout>
              <SectionRoute section="ADMIN"><AdminDashboardPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <ProtectedLayout>
              <SectionRoute section="COMPANIES"><CompaniesPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/company-settings"
          element={
            <ProtectedLayout>
              <SectionRoute section="COMPANY_SETTINGS"><CompanySettingsPage /></SectionRoute>
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/permissions"
          element={
            <ProtectedLayout>
              <SuperAdminPermissions />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/user-permissions"
          element={
            <ProtectedLayout>
              <CompanyAdminPermissions />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tools"
          element={
            <ProtectedLayout>
              <Navigate to="/sistemas/herramientas" replace />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <ProtectedLayout>
              <Navigate to="/sistemas/agentes" replace />
            </ProtectedLayout>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedLayout>
              <ProfilePage />
            </ProtectedLayout>
          }
        />
        <Route path="/cacao" element={<ProtectedLayout><SectionRoute section="CACAO"><CacaoDashboard /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/guia" element={<ProtectedLayout><SectionRoute section="CACAO"><CacaoHelpGuide /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/suppliers" element={<ProtectedLayout><SectionRoute section="CACAO"><SuppliersPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/clients" element={<ProtectedLayout><SectionRoute section="CACAO"><ClientsPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/receptions" element={<ProtectedLayout><SectionRoute section="CACAO"><ReceptionsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/receptions/new" element={<ProtectedLayout><SectionRoute section="CACAO"><ReceptionForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/lots" element={<ProtectedLayout><SectionRoute section="CACAO"><LotsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/lots/:id" element={<ProtectedLayout><SectionRoute section="CACAO"><LotDetail /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/settlements" element={<ProtectedLayout><SectionRoute section="CACAO"><SettlementsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/settlements/new" element={<ProtectedLayout><SectionRoute section="CACAO"><SettlementForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/settlements/:id" element={<ProtectedLayout><SectionRoute section="CACAO"><SettlementDetail /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/price-fixings" element={<ProtectedLayout><SectionRoute section="CACAO"><PriceFixingsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/shipments" element={<ProtectedLayout><SectionRoute section="CACAO"><ShipmentsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/shipments/new" element={<ProtectedLayout><SectionRoute section="CACAO"><ShipmentForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/shipments/:id" element={<ProtectedLayout><SectionRoute section="CACAO"><ShipmentDetail /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/payables" element={<ProtectedLayout><SectionRoute section="CACAO"><PayablesList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/receivables" element={<ProtectedLayout><SectionRoute section="CACAO"><ReceivablesList /></SectionRoute></ProtectedLayout>} />
        <Route path="/cacao/qualities" element={<ProtectedLayout><SectionRoute section="CACAO"><QualitiesPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><CustodiasList /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias/dashboard" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><CustodiasDashboard /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias/new" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><CustodiaForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias/nomina" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><NominaPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias/trabajador" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><ConsultaTrabajador /></SectionRoute></ProtectedLayout>} />
        <Route path="/custodias/gemebot" element={<ProtectedLayout><SectionRoute section="CUSTODIAS"><GemeBotChat /></SectionRoute></ProtectedLayout>} />
        <Route path="/contratacion-publica/entidades" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPEntidadesPublicasList /></SectionRoute></ProtectedLayout>} />
        <Route path="/contratacion-publica/entidades/:id" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPEntidadDetail /></SectionRoute></ProtectedLayout>} />
        <Route path="/contratacion-publica/mis-documentos" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPMisDocumentos /></SectionRoute></ProtectedLayout>} />
        <Route path="/contratacion-publica/por-revisar" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPPorRevisar /></SectionRoute></ProtectedLayout>} />
        {CP_MOSTRAR_SUBMODULOS_OCULTOS && (
          <>
            <Route path="/contratacion-publica/contratos" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPContratosList /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/contratos/nuevo" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPContratoForm /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/contratos/:id" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPContratoDetail /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/contratos/:id/editar" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPContratoForm /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/horarios" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPHorarioMensualList /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/horarios/:id" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPHorarioMensualEditor /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/informes" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPInformesList /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/informes/nuevo" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPInformeForm /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/informes/:id" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPInformeForm /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/config/codigos-turno" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPCodigosTurnoConfig /></SectionRoute></ProtectedLayout>} />
            <Route path="/contratacion-publica/config/textos-institucionales" element={<ProtectedLayout><SectionRoute section="CONTRATACION_PUBLICA"><CPTextosInstitucionalesConfig /></SectionRoute></ProtectedLayout>} />
          </>
        )}
        {!CP_MOSTRAR_SUBMODULOS_OCULTOS && (
          <Route path="/contratacion-publica/*" element={<Navigate to="/contratacion-publica/entidades" replace />} />
        )}
        <Route path="/rrhh" element={<ProtectedLayout><SectionRoute section="RRHH"><PersonalDashboard /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/reclutamiento" element={<ProtectedLayout><SectionRoute section="RRHH"><ReclutamientoPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/guardias" element={<ProtectedLayout><SectionRoute section="RRHH"><GuardiasList /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/administrativo" element={<ProtectedLayout><SectionRoute section="RRHH"><AdministrativeStaff /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/contracts" element={<ProtectedLayout><SectionRoute section="RRHH"><ContractsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/contracts/plantillas/nueva" element={<ProtectedLayout><SectionRoute section="RRHH"><ContractTemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/contracts/plantillas/:id" element={<ProtectedLayout><SectionRoute section="RRHH"><ContractTemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/contracts/generar" element={<ProtectedLayout><SectionRoute section="RRHH"><GenerarDocumento /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/entidades" element={<ProtectedLayout><SectionRoute section="RRHH"><EntidadesList /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/cumplimiento" element={<ProtectedLayout><SectionRoute section="RRHH"><CumplimientoEntidades /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/historial" element={<ProtectedLayout><SectionRoute section="RRHH"><HistorialGuardia /></SectionRoute></ProtectedLayout>} />
        <Route path="/rrhh/capacitaciones" element={<ProtectedLayout><SectionRoute section="RRHH"><TrainingsPage /></SectionRoute></ProtectedLayout>} />
        {/* Sin SectionRoute("RRHH") a propósito: cualquier empleado autenticado
            puede enviar una queja, tenga o no acceso al módulo de RRHH. Solo
            es un formulario de envío — la gestión vive aparte, gateada por
            RRHH, en /rrhh/quejas/gestion. */}
        <Route path="/rrhh/quejas" element={<ProtectedLayout><ComplaintsPage /></ProtectedLayout>} />
        <Route path="/rrhh/quejas/gestion" element={<ProtectedLayout><SectionRoute section="RRHH"><ComplaintsManagementPage /></SectionRoute></ProtectedLayout>} />
        {/* Sin SectionRoute("RRHH") a propósito, mismo motivo que Buzón de Quejas:
            cualquier empleado con cuenta puede tener encuestas pendientes. */}
        <Route path="/rrhh/encuestas" element={<ProtectedLayout><SurveysPage /></ProtectedLayout>} />
        <Route path="/rrhh/encuestas/gestion" element={<ProtectedLayout><SectionRoute section="RRHH"><SurveyManagementPage /></SectionRoute></ProtectedLayout>} />
        {/* Asignaciones y Movimientos se unieron en /rrhh/historial — se conservan como redirect por si hay enlaces guardados. */}
        <Route path="/rrhh/asignaciones" element={<Navigate to="/rrhh/historial" replace />} />
        <Route path="/rrhh/movimientos" element={<Navigate to="/rrhh/historial" replace />} />
        <Route path="/ventas" element={<ProtectedLayout><SectionRoute section="VENTAS"><VentasDashboard /></SectionRoute></ProtectedLayout>} />
        {/* Planificación y Campo (Visitas), Prospectos CRM (Leads), Reportes y Config Webhook están "Próximamente":
            sus pantallas siguen en el código (pages/ventas/VisitasPage, LeadsPage, VentasReportes, WebhookConfig) pero
            ya no tienen ruta — quien llegue por un enlace guardado o escribiendo la URL vuelve al Dashboard. Para
            reactivarlas: volver a importarlas arriba, registrar su ruta aquí y quitar `disabled` en Sidebar.tsx. */}
        {['visitas', 'leads', 'reportes', 'webhook-config'].map((p) => (
          <Route key={p} path={`/ventas/${p}`} element={<Navigate to="/ventas" replace />} />
        ))}
        <Route path="/ventas/clientes" element={<ProtectedLayout><SectionRoute section="VENTAS"><VentasClientesPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratosList /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/nuevo" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/nuevo/:templateId" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/:contractId/editar" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/:id" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoResult /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/configuracion" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/configuracion/:id" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/plantillas" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateList /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/dashboard" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><SistemasDashboardPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/herramientas" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><ToolsPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/agentes" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><AgentsPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/base-conocimiento" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><KnowledgeBasePage /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/soporte" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><SoporteTecnicoPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/sistemas/novedades" element={<ProtectedLayout><SectionRoute section="SISTEMAS"><NovedadesPage /></SectionRoute></ProtectedLayout>} />
      </Routes>
      </Suspense>

      {isAuthenticated() && (
        <>
          <ChatFloatingButton onClick={() => setChatOpen(true)} />
          <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
        </>
      )}
      </SidebarProvider>
      </PermissionsProvider>
    );
}

function App() {
  return (
    <BrowserRouter>
      <CompanyProvider>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </CompanyProvider>
    </BrowserRouter>
  );
}

export default App;
