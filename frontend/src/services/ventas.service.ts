import { api } from './auth.service';

export interface SalesGoalSeller {
  sellerId: number;
  fullName: string;
  email: string;
  goal: number;
  completedVisits: number;
  plannedVisits: number;
  progressPct: number;
  statusColor: 'GREEN' | 'YELLOW' | 'RED';
}

export interface ClientVisit {
  id: number;
  userId: number;
  user?: { id: number; fullName: string; email: string };
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  visitDate: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  checkInTime?: string;
  checkInLat?: number;
  checkInLng?: number;
  isVerified: boolean;
  commercialOffer?: string;
  quotedAmount?: number;
  outcome?: 'INTERESTED' | 'QUOTED' | 'CLOSED_SALE' | 'NOT_INTERESTED' | 'FOLLOW_UP';
  notes?: string;
  createdAt: string;
}

export interface Lead {
  id: number;
  fullName: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source: 'GOOGLE_ADS' | 'WEB_FORM' | 'EMAIL' | 'MANUAL';
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'QUOTED' | 'WON' | 'LOST';
  assignedUserId?: number;
  assignedUser?: { id: number; fullName: string; email: string };
  campaignName?: string;
  estimatedValue?: number;
  closedValue?: number;
  notes?: string;
  createdAt: string;
}

export interface SalesApiKey {
  id: number;
  name: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
}

// ==================== METAS Y DASHBOARD ====================
export const getVentasDashboard = (params?: { year?: number; week?: number }) =>
  api.get('/ventas/dashboard', { params }).then((r) => r.data);

export const getGoals = (params?: { year?: number; week?: number }) =>
  api.get('/ventas/goals', { params }).then((r) => r.data);

export const setGoal = (data: { userId: number; year: number; weekNumber: number; weeklyVisitGoal: number }) =>
  api.post('/ventas/goals', data).then((r) => r.data);

// ==================== VISITAS ====================
export const getVisits = (params?: { userId?: number; status?: string; startDate?: string; endDate?: string }) =>
  api.get('/ventas/visits', { params }).then((r) => r.data);

export const createVisit = (data: { clientName: string; clientAddress?: string; clientPhone?: string; visitDate: string; notes?: string }) =>
  api.post('/ventas/visits', data).then((r) => r.data);

export const checkInVisit = (id: number, coords?: { lat?: number; lng?: number }) =>
  api.post(`/ventas/visits/${id}/checkin`, coords || {}).then((r) => r.data);

export const completeVisit = (id: number, data: { commercialOffer?: string; quotedAmount?: number; outcome?: string; notes?: string }) =>
  api.post(`/ventas/visits/${id}/complete`, data).then((r) => r.data);

export const cancelVisit = (id: number, notes?: string) =>
  api.post(`/ventas/visits/${id}/cancel`, { notes }).then((r) => r.data);

export const deleteVisit = (id: number) => api.delete(`/ventas/visits/${id}`).then((r) => r.data);

// ==================== CRM LEADS ====================
export const getLeads = (params?: { assignedUserId?: number; status?: string; source?: string }) =>
  api.get('/ventas/leads', { params }).then((r) => r.data);

export const createLead = (data: { fullName: string; email?: string; phone?: string; companyName?: string; source?: string; campaignName?: string; estimatedValue?: number; notes?: string; assignedUserId?: number }) =>
  api.post('/ventas/leads', data).then((r) => r.data);

export const assignLead = (id: number, assignedUserId: number) =>
  api.patch(`/ventas/leads/${id}/assign`, { assignedUserId }).then((r) => r.data);

export const updateLeadStatus = (id: number, status: string, closedValue?: number) =>
  api.patch(`/ventas/leads/${id}/status`, { status, closedValue }).then((r) => r.data);

export const deleteLead = (id: number) => api.delete(`/ventas/leads/${id}`).then((r) => r.data);

// ==================== API KEYS ====================
export const getSalesApiKeys = () => api.get('/ventas/api-keys').then((r) => r.data);
export const createSalesApiKey = (name: string) => api.post('/ventas/api-keys', { name }).then((r) => r.data);
export const deleteSalesApiKey = (id: number) => api.delete(`/ventas/api-keys/${id}`).then((r) => r.data);
