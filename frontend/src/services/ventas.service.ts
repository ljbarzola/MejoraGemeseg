import { api } from './auth.service';

// ==================== TYPES ====================
export interface SalesTemplateField {
  id: number;
  templateId: number;
  variableName: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  isClientField: boolean;
  defaultValue?: string;
  dropdownOptions: string[];
  order: number;
}

export interface SalesTemplate {
  id: number;
  name: string;
  description?: string;
  driveUrl?: string;
  docxPath?: string;
  generatedPdfPath?: string;
  boldsignTemplateId?: string;
  emailSubject?: string;
  emailBody?: string;
  companyId: number;
  createdBy: number;
  createdAt: string;
  fields?: SalesTemplateField[];
  _count?: { fields: number; contracts: number };
}

export interface SalesContract {
  id: number;
  templateId: number;
  template?: SalesTemplate;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientCompany?: string;
  clientRuc?: string;
  clientAddress?: string;
  fieldValues: Record<string, any>;
  annexA?: any;
  annexB?: any;
  annexC?: any;
  generatedPdfPath?: string;
  boldsignDocumentId?: string;
  boldsignStatus?: string;
  status: string;
  sentAt?: string;
  signedAt?: string;
  companyId: number;
  createdBy: number;
  createdAt: string;
}

// ==================== TEMPLATES ====================
export const getTemplates = () =>
  api.get('/ventas/templates').then(r => r.data);

export const getTemplate = (id: number) =>
  api.get(`/ventas/templates/${id}`).then(r => r.data);

export const createTemplate = (data: { name: string; description?: string; driveUrl?: string; emailSubject?: string; emailBody?: string }) =>
  api.post('/ventas/templates', data).then(r => r.data);

export const updateTemplate = (id: number, data: any) =>
  api.patch(`/ventas/templates/${id}`, data).then(r => r.data);

export const deleteTemplate = (id: number) =>
  api.delete(`/ventas/templates/${id}`).then(r => r.data);

export const downloadFromDrive = (templateId: number) =>
  api.post(`/ventas/templates/${templateId}/download-drive`).then(r => r.data);

export const detectVariables = (templateId: number) =>
  api.post(`/ventas/templates/${templateId}/detect-variables`).then(r => r.data);

export const saveTemplateFields = (templateId: number, fields: any[]) =>
  api.post(`/ventas/templates/${templateId}/fields`, { fields }).then(r => r.data);

export const syncTemplateToBoldSign = (templateId: number) =>
  api.post(`/ventas/templates/${templateId}/sync-boldsign`).then(r => r.data);

// ==================== CONTRACTS ====================
export const getContracts = (params?: { status?: string; templateId?: number }) =>
  api.get('/ventas/contratos', { params }).then(r => r.data);

export const getContract = (id: number) =>
  api.get(`/ventas/contratos/${id}`).then(r => r.data);

export const createContract = (data: any) =>
  api.post('/ventas/contratos', data).then(r => r.data);

export const updateContract = (id: number, data: any) =>
  api.patch(`/ventas/contratos/${id}`, data).then(r => r.data);

export const generateContractPdf = (contractId: number) =>
  api.post(`/ventas/contratos/${contractId}/generate`).then(r => r.data);

export const sendContract = (contractId: number) =>
  api.post(`/ventas/contratos/${contractId}/send`).then(r => r.data);

export const deleteContract = (id: number) =>
  api.delete(`/ventas/contratos/${id}`).then(r => r.data);

// ==================== LEGACY: VISITS ====================
export interface ClientVisit {
  id: number; clientName: string; clientEmail?: string; clientPhone?: string;
  clientAddress?: string; location?: string; notes?: string; status: string;
  scheduledDate?: string; checkInTime?: string; checkOutTime?: string;
  checkInLat?: number; checkInLng?: number;
  visitDate?: string; isVerified?: boolean;
  commercialOffer?: string; quotedAmount?: number; outcome?: string;
  user?: any; companyId: number; createdBy: number; createdAt: string;
}
export const getVisits = (params?: any) => api.get('/ventas/visitas', { params }).then(r => r.data);
export const createVisit = (data: any) => api.post('/ventas/visitas', data).then(r => r.data);
export const checkInVisit = (id: number, data?: any) => api.post(`/ventas/visitas/${id}/checkin`, data).then(r => r.data);
export const completeVisit = (id: number, data?: any) => api.post(`/ventas/visitas/${id}/complete`, data).then(r => r.data);
export const cancelVisit = (id: number, reason?: string) => api.post(`/ventas/visitas/${id}/cancel`, { reason }).then(r => r.data);
export const deleteVisit = (id: number) => api.delete(`/ventas/visitas/${id}`).then(r => r.data);

// ==================== LEGACY: LEADS ====================
export interface Lead {
  id: number; name: string; fullName?: string; email?: string; phone?: string;
  company?: string; companyName?: string; campaignName?: string;
  source?: string; status: string; notes?: string;
  estimatedValue?: number; closedValue?: number;
  assignedTo?: number; assignedUserId?: number;
  companyId: number; createdBy: number; createdAt: string;
}
export const getLeads = (params?: any) => api.get('/ventas/leads', { params }).then(r => r.data);
export const createLead = (data: any) => api.post('/ventas/leads', data).then(r => r.data);
export const assignLead = (id: number, userId: number) => api.post(`/ventas/leads/${id}/assign`, { userId }).then(r => r.data);
export const updateLeadStatus = (id: number, status: string, closedValue?: number) => api.patch(`/ventas/leads/${id}`, { status, closedValue }).then(r => r.data);
export const deleteLead = (id: number) => api.delete(`/ventas/leads/${id}`).then(r => r.data);

// ==================== LEGACY: DASHBOARD ====================
export interface SalesGoalSeller {
  id: number; sellerId: number; sellerName: string; fullName?: string;
  month: string; goal: number; achieved: number;
  completedVisits?: number; plannedVisits?: number;
  progressPct?: number; statusColor?: string;
}
export const getVentasDashboard = () => api.get('/ventas/dashboard').then(r => r.data);
export const setGoal = (data: any) => api.post('/ventas/goals', data).then(r => r.data);

// ==================== LEGACY: WEBHOOK ====================
export interface SalesApiKey {
  id: number; name: string; key: string; apiKey?: string; isActive: boolean; createdAt: string;
}
export const getSalesApiKeys = () => api.get('/ventas/api-keys').then(r => r.data);
export const createSalesApiKey = (data: any) => api.post('/ventas/api-keys', data).then(r => r.data);
export const deleteSalesApiKey = (id: number) => api.delete(`/ventas/api-keys/${id}`).then(r => r.data);
