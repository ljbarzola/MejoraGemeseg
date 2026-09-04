import { api } from './auth.service';

export const getPersonalDashboard = () => api.get('/personal/dashboard').then(r => r.data);

export const getKanbanColumns = () => api.get('/personal/kanban/columns').then(r => r.data);
export const createKanbanColumn = (data: any) => api.post('/personal/kanban/columns', data).then(r => r.data);
export const updateKanbanColumn = (id: number, data: any) => api.patch(`/personal/kanban/columns/${id}`, data).then(r => r.data);
export const deleteKanbanColumn = (id: number) => api.delete(`/personal/kanban/columns/${id}`);
export const reorderKanbanColumns = (columns: { id: number; position: number }[]) => api.post('/personal/kanban/reorder', { columns }).then(r => r.data);

export const getCandidates = (params?: any) => api.get('/personal/candidates', { params }).then(r => r.data);
export const getCandidate = (id: number) => api.get(`/personal/candidates/${id}`).then(r => r.data);
export const createCandidate = (data: any) => api.post('/personal/candidates', data).then(r => r.data);
export const updateCandidate = (id: number, data: any) => api.patch(`/personal/candidates/${id}`, data).then(r => r.data);
export const moveCandidate = (id: number, columnId: number | null) => api.patch(`/personal/candidates/${id}/move`, { columnId }).then(r => r.data);
export const getCandidateHistory = (id: number) => api.get(`/personal/candidates/${id}/history`).then(r => r.data);

export const getContractTemplates = () => api.get('/personal/contracts/templates').then(r => r.data);
export const createContractTemplate = (data: any) => api.post('/personal/contracts/templates', data).then(r => r.data);
export const deleteContractTemplate = (id: number) => api.delete(`/personal/contracts/templates/${id}`);
export const generateContract = (data: any) => api.post('/personal/contracts/generate', data).then(r => r.data);
export const getContracts = () => api.get('/personal/contracts').then(r => r.data);

export const getCertifications = () => api.get('/personal/certifications').then(r => r.data);
export const createCertification = (data: any) => api.post('/personal/certifications', data).then(r => r.data);
export const updateCertification = (id: number, data: any) => api.patch(`/personal/certifications/${id}`, data).then(r => r.data);
export const deleteCertification = (id: number) => api.delete(`/personal/certifications/${id}`);
export const getCertificationAlerts = () => api.get('/personal/certifications/alerts').then(r => r.data);

export const getLogTemplates = () => api.get('/personal/logs/templates').then(r => r.data);
export const createLogTemplate = (data: any) => api.post('/personal/logs/templates', data).then(r => r.data);
export const deleteLogTemplate = (id: number) => api.delete(`/personal/logs/templates/${id}`);
export const getLogEntries = () => api.get('/personal/logs/entries').then(r => r.data);
export const createLogEntry = (data: any) => api.post('/personal/logs/entries', data).then(r => r.data);
export const deleteLogEntry = (id: number) => api.delete(`/personal/logs/entries/${id}`);

export const getDriveConfig = () => api.get('/personal/drive/config').then(r => r.data);
export const saveDriveConfig = (data: { driveFolderId: string; driveFolderName: string }) => api.post('/personal/drive/config', data).then(r => r.data);
export const testDriveConnection = () => api.post('/personal/drive/test').then(r => r.data);
export const syncDriveFolder = () => api.post('/personal/drive/sync').then(r => r.data);
export const getDriveCompliance = (cedula: string) => api.get(`/personal/drive/compliance/${cedula}`).then(r => r.data);
export const getDriveTree = () => api.get('/personal/drive/tree').then(r => r.data);
export const deleteDriveEmployee = (cedula: string) => api.delete(`/personal/drive/employee/${cedula}`).then(r => r.data);
export const getDocumentTypes = () => api.get('/personal/document-types').then(r => r.data);
export const createDocumentType = (data: any) => api.post('/personal/document-types', data).then(r => r.data);
export const updateDocumentType = (id: number, data: any) => api.patch(`/personal/document-types/${id}`, data).then(r => r.data);
export const deleteDocumentType = (id: number) => api.delete(`/personal/document-types/${id}`);

export const getJobPositions = () => api.get('/personal/reclutamiento/puestos').then(r => r.data);
export const createJobPosition = (data: { puesto: string; descripcion?: string; camposRequeridos?: string[]; archivosRequeridos?: string[] }) => api.post('/personal/reclutamiento/puestos', data).then(r => r.data);
export const updateJobPosition = (id: number, data: { puesto?: string; descripcion?: string; camposRequeridos?: string[]; archivosRequeridos?: string[] }) => api.patch(`/personal/reclutamiento/puestos/${id}`, data).then(r => r.data);
export const deleteJobPosition = (id: number) => api.delete(`/personal/reclutamiento/puestos/${id}`);
export const syncReclutamientoCandidates = () => api.post('/personal/reclutamiento/sync').then(r => r.data);
