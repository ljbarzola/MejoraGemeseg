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

export interface ContractSystemField { code: string; label: string }
export interface ContractField {
  id?: number;
  variableName: string;
  label: string;
  isRequired?: boolean;
  systemField?: string | null;
  order?: number;
}
export interface ContractTemplate {
  id: number;
  name: string;
  type: string;
  driveUrl: string | null;
  docxPath: string | null;
  fields: ContractField[];
}
export interface ContractAutofillField extends ContractField {
  value: string;
}

export const getContractSystemFields = (): Promise<ContractSystemField[]> => api.get('/personal/contracts/system-fields').then(r => r.data);
export const getContractTemplates = (): Promise<ContractTemplate[]> => api.get('/personal/contracts/templates').then(r => r.data);
export const getContractTemplateTypes = (): Promise<string[]> => api.get('/personal/contracts/templates/types').then(r => r.data);
export const getContractTemplate = (id: number): Promise<ContractTemplate> => api.get(`/personal/contracts/templates/${id}`).then(r => r.data);
export const createContractTemplate = (data: { name: string; type: string; driveUrl?: string }) => api.post('/personal/contracts/templates', data).then(r => r.data);
export const updateContractTemplate = (id: number, data: { name?: string; type?: string; driveUrl?: string }) => api.patch(`/personal/contracts/templates/${id}`, data).then(r => r.data);
export const downloadContractTemplateFromDrive = (id: number) => api.post(`/personal/contracts/templates/${id}/download-drive`).then(r => r.data);
export const detectContractTemplateVariables = (id: number): Promise<string[]> => api.get(`/personal/contracts/templates/${id}/detect-variables`).then(r => r.data);
export const saveContractTemplateFields = (id: number, fields: ContractField[]) => api.post(`/personal/contracts/templates/${id}/fields`, { fields }).then(r => r.data);
export const deleteContractTemplate = (id: number) => api.delete(`/personal/contracts/templates/${id}`);
export const getContractAutofill = (templateId: number, cedula: string, nombreGuardia: string): Promise<ContractAutofillField[]> =>
  api.get('/personal/contracts/autofill', { params: { templateId, cedula, nombreGuardia } }).then(r => r.data);
export const generateContract = (data: { templateId: number; cedula: string; nombreGuardia: string; fieldValues: Record<string, string> }) =>
  api.post('/personal/contracts/generate', data).then(r => r.data);
export const getContracts = () => api.get('/personal/contracts').then(r => r.data);
export const updateContract = (id: number, data: { status?: string; generatedUrl?: string }) => api.patch(`/personal/contracts/${id}`, data).then(r => r.data);

// generatedUrl ya viene como "/api/personal/contracts/file/..." — el origen
// se resuelve quitando el sufijo /api de VITE_API_URL, mismo patrón que
// ContratoResult.tsx en Ventas.
export const resolveContractFileUrl = (generatedUrl: string) =>
  `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '')}${generatedUrl}`;

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

export const getDriveConfig = (type?: string) => api.get('/personal/drive/config', { params: type ? { type } : {} }).then(r => r.data);
export const saveDriveConfig = (data: { driveFolderId: string; type?: string }) => api.post('/personal/drive/config', data).then(r => r.data);
export const testDriveConnection = (data?: { driveFolderId?: string; type?: string }) => api.post('/personal/drive/test', data || {}).then(r => r.data);
export const syncDriveFolder = () => api.post('/personal/drive/sync').then(r => r.data);
export const syncPersonalAdminFolder = () => api.post('/personal/drive/sync-personal-admin').then(r => r.data);
export const getDriveCompliance = (cedula: string) => api.get(`/personal/drive/compliance/${cedula}`).then(r => r.data);
export const getDriveTree = () => api.get('/personal/drive/tree').then(r => r.data);
export const deleteDriveEmployee = (cedula: string) => api.delete(`/personal/drive/employee/${cedula}`).then(r => r.data);
export const archivarCarpetaGuardia = (cedula: string) => api.post(`/personal/drive/guardia/${cedula}/archivar-carpeta`).then(r => r.data);
export interface AdministrativeStaffFicha {
  cedula: string;
  departamento: string | null;
  fechaIngreso: string | null;
  activo: boolean;
  tipoContrato: string | null;
  telefono: string | null;
  direccion: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaTelefono: string | null;
  salarioAcordado: number | null;
  camposPersonalizados: Record<string, string>;
  updatedAt?: string;
}

export interface UpdateAdministrativeStaffFichaInput {
  departamento?: string | null;
  fechaIngreso?: string | null;
  activo?: boolean;
  tipoContrato?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  salarioAcordado?: number | null;
  camposPersonalizados?: Record<string, string>;
}

export const getAdministrativoFicha = (cedula: string): Promise<AdministrativeStaffFicha> =>
  api.get(`/personal/administrativo-ficha/${cedula}`).then((r) => r.data);

export const setAdministrativoFicha = (
  cedula: string,
  data: UpdateAdministrativeStaffFichaInput,
): Promise<AdministrativeStaffFicha> =>
  api.patch(`/personal/administrativo-ficha/${cedula}`, data).then((r) => r.data);

export const getDocumentTypes = () => api.get('/personal/document-types').then(r => r.data);
export const createDocumentType = (data: any) => api.post('/personal/document-types', data).then(r => r.data);
export const updateDocumentType = (id: number, data: any) => api.patch(`/personal/document-types/${id}`, data).then(r => r.data);
export const deleteDocumentType = (id: number) => api.delete(`/personal/document-types/${id}`);

export interface CampoRequerido { nombre: string; tipo?: string }
export interface ArchivoRequerido { nombre: string; extensiones?: string[] }

export const getJobPositions = () => api.get('/personal/reclutamiento/puestos').then(r => r.data);
export const createJobPosition = (data: { puesto: string; descripcion?: string; camposRequeridos?: CampoRequerido[]; archivosRequeridos?: ArchivoRequerido[]; estado?: string }) => api.post('/personal/reclutamiento/puestos', data).then(r => r.data);
export const updateJobPosition = (id: number, data: { puesto?: string; descripcion?: string; camposRequeridos?: CampoRequerido[]; archivosRequeridos?: ArchivoRequerido[]; estado?: string }) => api.patch(`/personal/reclutamiento/puestos/${id}`, data).then(r => r.data);
export const deleteJobPosition = (id: number) => api.delete(`/personal/reclutamiento/puestos/${id}`);
export const syncReclutamientoCandidates = () => api.post('/personal/reclutamiento/sync').then(r => r.data);
export const syncJobPositionsFromDrive = () => api.post('/personal/reclutamiento/sync-puestos').then(r => r.data);

export interface ReviewDocumentPayload {
  cedula: string;
  documentTypeId?: number;
  driveFileId?: string;
  status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  reason?: string;
  fileName?: string;
}
export const reviewDocument = (data: ReviewDocumentPayload) => api.post('/personal/drive/documents/review', data).then(r => r.data);
export const getDocumentReviews = (cedula: string) => api.get(`/personal/drive/documents/reviews/${cedula}`).then(r => r.data);
export const getDocumentReviewHistory = (cedula?: string) => api.get('/personal/drive/documents/review-history', { params: cedula ? { cedula } : {} }).then(r => r.data);
export const reassignDocumentType = (driveFileId: string, documentTypeId: number) => api.patch(`/personal/drive/documents/${driveFileId}/reassign-type`, { documentTypeId }).then(r => r.data);
export const reassignReclutamientoFile = (driveFileId: string, archivoNombre: string) => api.patch(`/personal/reclutamiento/documentos/${driveFileId}/reassign`, { archivoNombre }).then(r => r.data);
export const saveCandidatoDatos = (folderId: string, datos: Record<string, string>) => api.patch(`/personal/reclutamiento/candidatos/${folderId}/datos`, { datos }).then(r => r.data);
export const contratarCandidato = (folderId: string) => api.post(`/personal/reclutamiento/candidatos/${folderId}/contratar`).then(r => r.data);
