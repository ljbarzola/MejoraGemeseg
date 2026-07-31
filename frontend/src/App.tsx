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
import Navbar from './components/layout/Navbar';
import ChatFloatingButton from './components/chat/ChatFloatingButton';
import ChatDrawer from './components/chat/ChatDrawer';
import { CompanyProvider } from './contexts/ThemeContext';
import { isAuthenticated } from './services/auth.service';

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const CompaniesPage = lazy(() => import('./pages/admin/CompaniesPage'));
const CompanySettingsPage = lazy(() => import('./pages/admin/CompanySettingsPage'));
const ToolsPage = lazy(() => import('./pages/tools/ToolsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const AgentsPage = lazy(() => import('./pages/admin/AgentsPage'));
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

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="no-print"><Navbar /></div>
      {children}
    </ProtectedRoute>
  );
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

function App() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <BrowserRouter>
      <CompanyProvider>
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
              <DashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedLayout>
              <ProjectsListPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/new"
          element={
            <ProtectedLayout>
              <CreateProjectPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedLayout>
              <ProjectDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id/tasks"
          element={
            <ProtectedLayout>
              <KanbanPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id/tasks/new"
          element={
            <ProtectedLayout>
              <CreateTaskPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedLayout>
              <TaskDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks/new"
          element={
            <ProtectedLayout>
              <CreateTaskPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedLayout>
              <AdminDashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <ProtectedLayout>
              <AgentsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <ProtectedLayout>
              <CompaniesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/company-settings"
          element={
            <ProtectedLayout>
              <CompanySettingsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tools"
          element={
            <ProtectedLayout>
              <ToolsPage />
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
        <Route path="/cacao" element={<ProtectedLayout><CacaoDashboard /></ProtectedLayout>} />
        <Route path="/cacao/guia" element={<ProtectedLayout><CacaoHelpGuide /></ProtectedLayout>} />
        <Route path="/cacao/suppliers" element={<ProtectedLayout><SuppliersPage /></ProtectedLayout>} />
        <Route path="/cacao/clients" element={<ProtectedLayout><ClientsPage /></ProtectedLayout>} />
        <Route path="/cacao/receptions" element={<ProtectedLayout><ReceptionsList /></ProtectedLayout>} />
        <Route path="/cacao/receptions/new" element={<ProtectedLayout><ReceptionForm /></ProtectedLayout>} />
        <Route path="/cacao/lots" element={<ProtectedLayout><LotsList /></ProtectedLayout>} />
        <Route path="/cacao/lots/:id" element={<ProtectedLayout><LotDetail /></ProtectedLayout>} />
        <Route path="/cacao/settlements" element={<ProtectedLayout><SettlementsList /></ProtectedLayout>} />
        <Route path="/cacao/settlements/new" element={<ProtectedLayout><SettlementForm /></ProtectedLayout>} />
        <Route path="/cacao/settlements/:id" element={<ProtectedLayout><SettlementDetail /></ProtectedLayout>} />
        <Route path="/cacao/price-fixings" element={<ProtectedLayout><PriceFixingsList /></ProtectedLayout>} />
        <Route path="/cacao/shipments" element={<ProtectedLayout><ShipmentsList /></ProtectedLayout>} />
        <Route path="/cacao/shipments/new" element={<ProtectedLayout><ShipmentForm /></ProtectedLayout>} />
        <Route path="/cacao/shipments/:id" element={<ProtectedLayout><ShipmentDetail /></ProtectedLayout>} />
        <Route path="/cacao/payables" element={<ProtectedLayout><PayablesList /></ProtectedLayout>} />
        <Route path="/cacao/receivables" element={<ProtectedLayout><ReceivablesList /></ProtectedLayout>} />
        <Route path="/cacao/qualities" element={<ProtectedLayout><QualitiesPage /></ProtectedLayout>} />
      </Routes>
      </Suspense>

      {isAuthenticated() && (
        <>
          <ChatFloatingButton onClick={() => setChatOpen(true)} />
          <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
        </>
      )}
      </CompanyProvider>
    </BrowserRouter>
  );
}

export default App;
