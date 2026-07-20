import { useState } from 'react';
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
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import CompaniesPage from './pages/admin/CompaniesPage';
import CompanySettingsPage from './pages/admin/CompanySettingsPage';
import ToolsPage from './pages/tools/ToolsPage';
import ProfilePage from './pages/profile/ProfilePage';
import AgentsPage from './pages/admin/AgentsPage';
import CacaoDashboard from './pages/cacao/CacaoDashboard';
import SuppliersPage from './pages/cacao/suppliers/SuppliersPage';
import ClientsPage from './pages/cacao/clients/ClientsPage';
import ReceptionsList from './pages/cacao/receptions/ReceptionsList';
import ReceptionForm from './pages/cacao/receptions/ReceptionForm';
import LotsList from './pages/cacao/lots/LotsList';
import LotDetail from './pages/cacao/lots/LotDetail';
import SettlementsList from './pages/cacao/settlements/SettlementsList';
import SettlementForm from './pages/cacao/settlements/SettlementForm';
import PriceFixingsList from './pages/cacao/price-fixings/PriceFixingsList';
import ShipmentsList from './pages/cacao/shipments/ShipmentsList';
import ShipmentForm from './pages/cacao/shipments/ShipmentForm';
import PayablesList from './pages/cacao/payables/PayablesList';
import ReceivablesList from './pages/cacao/receivables/ReceivablesList';
import QualitiesPage from './pages/cacao/qualities/QualitiesPage';
import KardexList from './pages/cacao/kardex/KardexList';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/layout/Navbar';
import ChatFloatingButton from './components/chat/ChatFloatingButton';
import ChatDrawer from './components/chat/ChatDrawer';
import { CompanyProvider } from './contexts/ThemeContext';
import { isAuthenticated } from './services/auth.service';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
}

function App() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <BrowserRouter>
      <CompanyProvider>
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
        <Route path="/cacao/suppliers" element={<ProtectedLayout><SuppliersPage /></ProtectedLayout>} />
        <Route path="/cacao/clients" element={<ProtectedLayout><ClientsPage /></ProtectedLayout>} />
        <Route path="/cacao/receptions" element={<ProtectedLayout><ReceptionsList /></ProtectedLayout>} />
        <Route path="/cacao/receptions/new" element={<ProtectedLayout><ReceptionForm /></ProtectedLayout>} />
        <Route path="/cacao/lots" element={<ProtectedLayout><LotsList /></ProtectedLayout>} />
        <Route path="/cacao/lots/:id" element={<ProtectedLayout><LotDetail /></ProtectedLayout>} />
        <Route path="/cacao/settlements" element={<ProtectedLayout><SettlementsList /></ProtectedLayout>} />
        <Route path="/cacao/settlements/new" element={<ProtectedLayout><SettlementForm /></ProtectedLayout>} />
        <Route path="/cacao/price-fixings" element={<ProtectedLayout><PriceFixingsList /></ProtectedLayout>} />
        <Route path="/cacao/shipments" element={<ProtectedLayout><ShipmentsList /></ProtectedLayout>} />
        <Route path="/cacao/shipments/new" element={<ProtectedLayout><ShipmentForm /></ProtectedLayout>} />
        <Route path="/cacao/payables" element={<ProtectedLayout><PayablesList /></ProtectedLayout>} />
        <Route path="/cacao/receivables" element={<ProtectedLayout><ReceivablesList /></ProtectedLayout>} />
        <Route path="/cacao/qualities" element={<ProtectedLayout><QualitiesPage /></ProtectedLayout>} />
        <Route path="/cacao/kardex" element={<ProtectedLayout><KardexList /></ProtectedLayout>} />
      </Routes>

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
