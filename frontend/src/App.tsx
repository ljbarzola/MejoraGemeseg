import { useState, Suspense, lazy } from 'react';
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
import { CompanyProvider } from './contexts/ThemeContext';
import { usePerm } from './contexts/PermissionsContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { usePermissions } from './hooks/usePermissions';
import { isAuthenticated } from './services/auth.service';

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const CompaniesPage = lazy(() => import('./pages/admin/CompaniesPage'));
const CompanySettingsPage = lazy(() => import('./pages/admin/CompanySettingsPage'));
const ToolsPage = lazy(() => import('./pages/tools/ToolsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const AgentsPage = lazy(() => import('./pages/admin/AgentsPage'));
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
const PersonalDashboard = lazy(() => import('./pages/personal/PersonalDashboard'));
const ReclutamientoPage = lazy(() => import('./pages/personal/ReclutamientoPage'));
const GuardiasList = lazy(() => import('./pages/personal/GuardiasList'));
const AdministrativeStaff = lazy(() => import('./pages/personal/AdministrativeStaff'));
const RecruitmentKanban = lazy(() => import('./pages/personal/recruitment/RecruitmentKanban'));
const CandidatesList = lazy(() => import('./pages/personal/candidates/CandidatesList'));
const CandidateForm = lazy(() => import('./pages/personal/candidates/CandidateForm'));
const ContractsList = lazy(() => import('./pages/personal/contracts/ContractsList'));
const CertificationsList = lazy(() => import('./pages/personal/certifications/CertificationsList'));
const LogEntriesPage = lazy(() => import('./pages/personal/logs/LogEntries'));
const CompliancePanel = lazy(() => import('./pages/personal/compliance/CompliancePanel'));
const DriveConfig = lazy(() => import('./pages/personal/compliance/DriveConfig'));
const DocumentTypeConfig = lazy(() => import('./pages/personal/compliance/DocumentTypeConfig'));
const VerificacionPage = lazy(() => import('./pages/personal/VerificacionPage'));
const VentasDashboard = lazy(() => import('./pages/ventas/VentasDashboard'));
const VisitasPage = lazy(() => import('./pages/ventas/VisitasPage'));
const LeadsPage = lazy(() => import('./pages/ventas/LeadsPage'));
const VentasReportes = lazy(() => import('./pages/ventas/VentasReportes'));
const WebhookConfig = lazy(() => import('./pages/ventas/WebhookConfig'));
const TemplateList = lazy(() => import('./pages/ventas/TemplateList'));
const TemplateConfig = lazy(() => import('./pages/ventas/TemplateConfig'));
const ContratosList = lazy(() => import('./pages/ventas/ContratosList'));
const ContratoForm = lazy(() => import('./pages/ventas/ContratoForm'));
const ContratoResult = lazy(() => import('./pages/ventas/ContratoResult'));

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="no-print"><Sidebar /></div>
      <div className="main-content">
        {children}
      </div>
    </ProtectedRoute>
  );
}

function SectionRoute({ section, children }: { section: string; children: React.ReactNode }) {
  const { canView, loading } = usePerm();
  if (loading) return <LoadingFallback />;
  if (!canView(section)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#718096' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'spin 1s linear infinite' }}>&#8635;</div>
        <div>Cargando...</div>
      </div>
    </div>
  );
}

function AppInner() {
  const perms = usePermissions();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <PermissionsProvider value={perms}>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated() ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
          path="/admin/agents"
          element={
            <ProtectedLayout>
              <SectionRoute section="AGENTS"><AgentsPage /></SectionRoute>
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
              <SectionRoute section="TOOLS"><ToolsPage /></SectionRoute>
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
        <Route path="/personal" element={<ProtectedLayout><SectionRoute section="PERSONAL"><PersonalDashboard /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/reclutamiento" element={<ProtectedLayout><SectionRoute section="PERSONAL"><ReclutamientoPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/guardias" element={<ProtectedLayout><SectionRoute section="PERSONAL"><GuardiasList /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/administrativo" element={<ProtectedLayout><SectionRoute section="PERSONAL"><AdministrativeStaff /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/kanban" element={<ProtectedLayout><SectionRoute section="PERSONAL"><RecruitmentKanban /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/candidates" element={<ProtectedLayout><SectionRoute section="PERSONAL"><CandidatesList /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/candidates/new" element={<ProtectedLayout><SectionRoute section="PERSONAL"><CandidateForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/candidates/:id" element={<ProtectedLayout><SectionRoute section="PERSONAL"><CandidateForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/contracts" element={<ProtectedLayout><SectionRoute section="PERSONAL"><ContractsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/certifications" element={<ProtectedLayout><SectionRoute section="PERSONAL"><CertificationsList /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/logs" element={<ProtectedLayout><SectionRoute section="PERSONAL"><LogEntriesPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/compliance" element={<ProtectedLayout><SectionRoute section="PERSONAL"><CompliancePanel /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/drive-config" element={<ProtectedLayout><SectionRoute section="PERSONAL"><DriveConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/document-types" element={<ProtectedLayout><SectionRoute section="PERSONAL"><DocumentTypeConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/personal/verificacion" element={<ProtectedLayout><SectionRoute section="PERSONAL"><VerificacionPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas" element={<ProtectedLayout><SectionRoute section="VENTAS"><VentasDashboard /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/visitas" element={<ProtectedLayout><SectionRoute section="VENTAS"><VisitasPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/leads" element={<ProtectedLayout><SectionRoute section="VENTAS"><LeadsPage /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/reportes" element={<ProtectedLayout><SectionRoute section="VENTAS"><VentasReportes /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/webhook-config" element={<ProtectedLayout><SectionRoute section="VENTAS"><WebhookConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratosList /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/nuevo" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/nuevo/:templateId" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoForm /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/:id" element={<ProtectedLayout><SectionRoute section="VENTAS"><ContratoResult /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/configuracion" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/configuracion/:id" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateConfig /></SectionRoute></ProtectedLayout>} />
        <Route path="/ventas/contratos/plantillas" element={<ProtectedLayout><SectionRoute section="VENTAS"><TemplateList /></SectionRoute></ProtectedLayout>} />
      </Routes>
      </Suspense>

      {isAuthenticated() && (
        <>
          <ChatFloatingButton onClick={() => setChatOpen(true)} />
          <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
        </>
      )}
      </PermissionsProvider>
    );
}

function App() {
  return (
    <BrowserRouter>
      <CompanyProvider>
        <AppInner />
      </CompanyProvider>
    </BrowserRouter>
  );
}

export default App;
