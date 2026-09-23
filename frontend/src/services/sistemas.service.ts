import { api } from './auth.service';

export type TicketSoporteTipo = 'ERROR' | 'MEJORA' | 'PERMISO' | 'OTRO';
export type TicketSoporteEstado = 'ABIERTO' | 'EN_REVISION' | 'RESUELTO';

export interface TicketSoporteAttachment {
  id: number;
  url: string;
  nombre: string | null;
}

export interface TicketSoporte {
  id: number;
  companyId: number | null;
  createdById: number;
  tipo: TicketSoporteTipo;
  titulo: string;
  descripcion: string;
  capturaUrl: string | null;
  estado: TicketSoporteEstado;
  createdAt: string;
  resueltoAt: string | null;
  createdBy: { id: number; fullName: string; email: string };
  company: { id: number; name: string } | null;
  attachments: TicketSoporteAttachment[];
}

export const createTicketSoporte = (data: {
  tipo: TicketSoporteTipo;
  titulo: string;
  descripcion: string;
  capturaUrl?: string;
  attachments?: { url: string; nombre?: string }[];
}) => api.post('/sistemas/tickets', data).then((r) => r.data);

export const getTicketsSoporte = (): Promise<TicketSoporte[]> =>
  api.get('/sistemas/tickets').then((r) => r.data);

export const updateTicketSoporteEstado = (id: number, estado: TicketSoporteEstado) =>
  api.patch(`/sistemas/tickets/${id}/estado`, { estado }).then((r) => r.data);

export const uploadTicketFile = (file: File): Promise<{ url: string; nombre: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/sistemas/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export interface SistemasDriveConfig {
  id: number;
  companyId: number;
  driveFolderId: string;
  driveFolderLink?: string | null;
}

export const getSistemasDriveConfig = (companyId?: number): Promise<SistemasDriveConfig | null> =>
  api.get('/sistemas/drive-config', { params: companyId ? { companyId } : {} }).then((r) => r.data);

export const saveSistemasDriveConfig = (driveFolderId: string, companyId?: number): Promise<SistemasDriveConfig> =>
  api.post('/sistemas/drive-config', { driveFolderId, ...(companyId ? { companyId } : {}) }).then((r) => r.data);

export const testSistemasDriveConnection = (driveFolderId: string): Promise<{ success: boolean; message: string }> =>
  api.post('/sistemas/drive-config/test', { driveFolderId }).then((r) => r.data);

export interface SistemasDashboardStats {
  abiertos: number;
  enRevision: number;
  resueltos: number;
  totalMes: number;
}

export const getSistemasDashboardStats = (): Promise<SistemasDashboardStats> =>
  api.get('/sistemas/dashboard/stats').then((r) => r.data);
