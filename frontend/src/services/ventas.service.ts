import { api } from './auth.service';

// ==================== TYPES ====================
export interface TableColumn {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE';
}

export interface TableFieldConfig {
  columns: TableColumn[];
  maxRows: number;
}

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
  allowMultiple?: boolean;
  allowOther?: boolean;
  tableConfig?: TableFieldConfig | null;
  clientPrompt?: string | null;
  clientFieldKey?: string | null;
  order: number;
}

export interface SalesTemplate {
  id: number;
  name: string;
  description?: string;
  driveUrl?: string;
  docxPath?: string;
  generatedPdfPath?: string;
  emailSubject?: string;
  emailBody?: string;
  numberingPrefix?: string | null;
  numberingDigits: number;
  numberingNext: number;
  driveFolderId?: string | null;
  companyId: number;
  createdBy: number;
  createdAt: string;
  fields?: SalesTemplateField[];
  _count?: { fields: number; contracts: number };
}

export interface SalesContractDocument {
  id: number;
  contractId: number;
  type: 'GENERADO' | 'ENVIADO' | 'FIRMADO';
  filePath: string;
  createdAt: string;
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
  contractNumber?: string | null;
  generatedPdfPath?: string;
  signwellDocumentId?: string;
  signwellStatus?: string;
  status: string;
  sentAt?: string;
  signedAt?: string;
  clientFillToken?: string | null;
  clientFilledAt?: string | null;
  salesClientId?: number | null;
  companyId: number;
  createdBy: number;
  createdAt: string;
}

export interface PublicFillField {
  variableName: string;
  label: string;
  tableConfig: TableFieldConfig;
  value: Record<string, string>[];
}

export interface PublicContractFill {
  contractId: number;
  clientName: string;
  alreadySubmitted: boolean;
  fields: PublicFillField[];
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

export const uploadTemplateDocx = (templateId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/ventas/templates/${templateId}/upload-docx`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

export const detectVariables = (templateId: number) =>
  api.post(`/ventas/templates/${templateId}/detect-variables`).then(r => r.data);

export const saveTemplateFields = (templateId: number, fields: any[]) =>
  api.post(`/ventas/templates/${templateId}/fields`, { fields }).then(r => r.data);

// ==================== CONTRACTS ====================
export const getContracts = (params?: { status?: string; templateId?: number }) =>
  api.get('/ventas/contratos', { params }).then(r => r.data);

export const getContract = (id: number) =>
  api.get(`/ventas/contratos/${id}`).then(r => r.data);

export const createContract = (data: any) =>
  api.post('/ventas/contratos', data).then(r => r.data);

export const updateContract = (id: number, data: any) =>
  api.patch(`/ventas/contratos/${id}`, data).then(r => r.data);

export interface GenerateContractPdfResult {
  success: boolean;
  pdfUrl: string;
  // Presente solo si el respaldo en Google Drive falló — el PDF se generó
  // igual (ver uploadToDriveIfConfigured en el backend).
  driveWarning?: string;
}

export const generateContractPdf = (contractId: number): Promise<GenerateContractPdfResult> =>
  api.post(`/ventas/contratos/${contractId}/generate`).then(r => r.data);

export interface SendContractResult {
  success: boolean;
  documentId: string;
  // Link directo de la sesión de firma en SignWell para el destinatario del
  // contrato — se puede copiar y abrir sin depender de que el correo llegue
  // (útil en pruebas, con SIGNWELL_TEST_MODE). No es exclusivo de ninguna
  // plantilla: SignWell lo genera para cualquier documento enviado.
  signingUrl: string | null;
  // Presente solo si el respaldo en Google Drive falló — el envío en sí ya
  // se completó igual (ver uploadToDriveIfConfigured en el backend).
  driveWarning?: string;
}

// `email`: lo que la ficha muestra en "Envío de correo" (Para/Asunto/Mensaje).
export const sendContract = (
  contractId: number,
  email?: { email?: string; subject?: string; message?: string },
): Promise<SendContractResult> =>
  api.post(`/ventas/contratos/${contractId}/send`, email ?? {}).then(r => r.data);

export interface SignatureStatus {
  documentId: string;
  status: string;
  contractStatus: string;
  recipients: Array<{
    name: string | null;
    email: string | null;
    status: string | null;
    bounced: boolean;
    bouncedDetails: string | null;
    signingUrl: string | null;
  }>;
  // Presente solo si, al detectar que el documento ya se firmó, el respaldo
  // en Google Drive del PDF firmado falló (ver uploadToDriveIfConfigured).
  driveWarning?: string;
}

export const getContractSignatureStatus = (contractId: number): Promise<SignatureStatus> =>
  api.get(`/ventas/contratos/${contractId}/signature-status`).then(r => r.data);

export const deleteContract = (id: number) =>
  api.delete(`/ventas/contratos/${id}`).then(r => r.data);

// Público (sin sesión) — para el link que completa el cliente
export const getPublicContractFill = (token: string): Promise<PublicContractFill> =>
  api.get(`/ventas/contratos/public/${token}`).then(r => r.data);

// `redirectToSign`: si el contrato tiene una tabla para el cliente, el
// backend genera el PDF y lo manda a SignWell de inmediato tras este
// submit — este link es a dónde redirigir al cliente para que firme en la
// misma sesión, sin esperar un segundo correo (ver ventas-contratos.md).
export interface PublicContractFillResult {
  success: true;
  redirectToSign?: string | null;
}

export const submitPublicContractFill = (token: string, values: Record<string, any>): Promise<PublicContractFillResult> =>
  api.post(`/ventas/contratos/public/${token}/submit`, { values }).then(r => r.data);

export const getContractDocuments = (contractId: number): Promise<SalesContractDocument[]> =>
  api.get(`/ventas/contratos/${contractId}/documents`).then(r => r.data);

export interface UploadSignedContractResult {
  success: boolean;
  filePath: string;
  // Presente solo si el respaldo en Google Drive falló — la subida en sí ya
  // se completó igual (ver uploadToDriveIfConfigured en el backend).
  driveWarning?: string;
}

// Sube a mano el PDF ya firmado — respaldo para cuando el webhook de
// SignWell no está configurado en este entorno (ver ventas-contratos.md).
export const uploadSignedContract = (contractId: number, file: File): Promise<UploadSignedContractResult> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/ventas/contratos/${contractId}/documents/signed`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

// Carpeta raíz de Drive para los documentos de Contratos: ID fijo en
// backend `HARDCODED_DRIVE_FOLDERS.VENTAS_CONTRATOS` (no se configura en la UI).
export const getVentasDriveConfig = () =>
  api.get('/personal/drive/config', { params: { type: 'VENTAS_CONTRATOS' } }).then(r => r.data);

// Los PDFs de contratos requieren sesión iniciada; se descargan con la
// instancia de axios autenticada (no un <iframe>/<a> directo) y se muestran
// como blob. `apiPath` viene de la BD con el prefijo "/api/..." incluido,
// que ya forma parte del baseURL de `api`, por eso se recorta aquí.
export const fetchProtectedFile = (apiPath: string): Promise<Blob> =>
  api.get(apiPath.replace(/^\/api/, ''), { responseType: 'blob' }).then(r => r.data);

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

export interface SalesClientFieldOption {
  key: string;
  label: string;
  // Hijos de la opción: sub-servicios de `servicio_requerido`, o casillas de
  // un campo LISTA_SUBOPCIONES.
  children?: { key: string; label: string }[];
}

// Keys de los campos núcleo "Servicio requerido" y "Sub-servicios" (este
// último guarda en extra las keys marcadas, separadas por coma).
export const SERVICIO_KEY = 'servicio_requerido';
export const SUBSERVICIOS_KEY = 'subservicios_requeridos';
export const FUENTE_KEY = 'fuente';
// Lista con casillas por opción. La opción va en extra[key]; las casillas, en extra[key__sub].
export const LISTA_SUBOPCIONES = 'LISTA_SUBOPCIONES';

export function subopcionesKey(fieldKey: string): string {
  return `${fieldKey}__sub`;
}

export interface SalesClientField {
  id: number;
  companyId: number;
  key: string;
  label: string;
  fieldType: string;
  // Relevante si fieldType === 'SELECT' o 'LISTA_SUBOPCIONES'.
  options: SalesClientFieldOption[];
  // Relevante si fieldType === 'SELECT' o 'LISTA_SUBOPCIONES': agrega una
  // opción "Otro" con texto libre (mismo patrón que SalesTemplateField.allowOther).
  allowOther: boolean;
  isCore: boolean;
  order: number;
}

export interface SalesClientStage {
  id: number;
  key: string;
  label: string;
  color: string;
  order: number;
  isInitial: boolean;
  isFinal: boolean;
}

export interface MiReferidoCliente {
  id: number;
  name: string;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  stage: SalesClientStage | null;
}

export interface SalesClient {
  id: number;
  companyId: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  ruc?: string | null;
  address?: string | null;
  observaciones?: string | null;
  extra?: Record<string, string>;
  // A quién se le da crédito/se notifica si vino de un referido — nunca
  // editable desde el formulario normal, solo lo fija el servidor al crear
  // el registro vía /referir.
  referredByUserId?: number | null;
  referredBy?: { id: number; fullName: string } | null;
  // Quién de Ventas atiende la venta — distinto de `creator` (quién creó el
  // registro) y de `referredBy` (quién lo refirió). Se asigna/desasigna con
  // asignarSalesClienteAMi/quitarSalesClienteAMi, nunca por PATCH normal.
  assignedUserId?: number | null;
  assignedUser?: { id: number; fullName: string } | null;
  status?: string | null;
  stage?: SalesClientStage | null;
  // Siguiente paso con este cliente (vista "Hoy"). La fecha llega como ISO a
  // medianoche UTC: para compararla con "hoy" usar solo los primeros 10
  // caracteres ('YYYY-MM-DD'), nunca new Date(), que la correría de día.
  nextActionText?: string | null;
  nextActionDate?: string | null;
  createdAt: string;
  creator?: { id: number; fullName: string } | null;
}

export const getSalesClientFields = () =>
  api.get('/ventas/clientes/fields').then(r => r.data as SalesClientField[]);
export const addSalesClientField = (data: { label: string; key?: string; fieldType?: string; options?: SalesClientFieldOption[]; allowOther?: boolean }) =>
  api.post('/ventas/clientes/fields', data).then(r => r.data as SalesClientField);
export const updateSalesClientField = (id: number, data: Partial<{ label: string; options: SalesClientFieldOption[]; allowOther: boolean; order: number }>) =>
  api.patch(`/ventas/clientes/fields/${id}`, data).then(r => r.data as SalesClientField);
export const deleteSalesClientField = (id: number) =>
  api.delete(`/ventas/clientes/fields/${id}`).then(r => r.data);

export const getSalesClientStages = () =>
  api.get('/ventas/clientes/stages').then(r => r.data as SalesClientStage[]);
export const createSalesClientStage = (data: { key: string; label: string; color?: string; order?: number; isInitial?: boolean; isFinal?: boolean }) =>
  api.post('/ventas/clientes/stages', data).then(r => r.data as SalesClientStage);
export const updateSalesClientStage = (id: number, data: Partial<{ label: string; color: string; order: number; isInitial: boolean; isFinal: boolean }>) =>
  api.patch(`/ventas/clientes/stages/${id}`, data).then(r => r.data as SalesClientStage);
export const deleteSalesClientStage = (id: number) =>
  api.delete(`/ventas/clientes/stages/${id}`);
export const changeSalesClientStage = (
  id: number,
  toStatus: string,
  notes?: string,
  siguientePaso?: { text: string; date: string },
) =>
  api.patch(`/ventas/clientes/${id}/stage`, {
    toStatus,
    notes,
    ...(siguientePaso ? { nextActionText: siguientePaso.text, nextActionDate: siguientePaso.date } : {}),
  }).then(r => r.data as SalesClient);
// ---------- Dashboard de Ventas (a partir de Clientes) ----------

export interface DashboardClientes {
  alcance: { responsable: string; desde: string; hasta: string; hoy: string; esManager: boolean };
  responsables: { id: number; nombre: string }[];
  seguimientos: { vencidos: number; hoy: number; sinFecha: number; activos: number };
  embudo: { key: string | null; label: string; color: string; isFinal: boolean; count: number }[];
  porResponsable: { userId: number | null; nombre: string; activos: number; vencidos: number; aceptados: number }[];
  nuevos: { total: number; referidos: number; porSemana: { inicio: string; total: number }[] };
  referidos: {
    recibidos: number; sinAtender: number; aceptados: number; rechazados: number;
    top: { userId: number; nombre: string; total: number }[];
  };
  estancados: {
    dias: number; total: number;
    lista: { id: number; name: string; etapa: string; color: string; dias: number; responsable: string | null }[];
  };
  aceptacion: { aceptados: number; rechazados: number; tasa: number | null };
  contratos: { borrador: number; enFirma: number; firmados: number; aceptadosSinContrato: number; sinClienteVinculado: number };
}

// `hoy` es el día local de quien mira (nextActionDate es solo-día).
export const getDashboardClientes = (params: { desde?: string; hasta?: string; responsable?: string; hoy: string }) =>
  api.get('/ventas/clientes/dashboard', { params }).then(r => r.data as DashboardClientes);

// ---------- Ficha del cliente: línea de tiempo y actividades ----------

export type SalesActivityType = 'NOTA' | 'LLAMADA' | 'REUNION' | 'CORREO' | 'OTRO';

export const SALES_ACTIVITY_TYPES: { value: SalesActivityType; label: string }[] = [
  { value: 'NOTA', label: 'Nota' },
  { value: 'LLAMADA', label: 'Llamada' },
  { value: 'REUNION', label: 'Reunión' },
  { value: 'CORREO', label: 'Correo' },
  { value: 'OTRO', label: 'Otro' },
];

export interface TimelineStageInfo { label: string; color: string }

export type TimelineEvent =
  | { kind: 'creado'; id: string; at: string; authorName: string | null; referredByName: string | null }
  | { kind: 'etapa'; id: string; at: string; authorName: string | null; from: TimelineStageInfo | null; to: TimelineStageInfo | null; notes: string | null }
  | {
      kind: 'actividad'; id: string; activityId: number; at: string; authorId: number | null; authorName: string | null;
      type: SalesActivityType; otherLabel: string | null; text: string; edited: boolean;
    }
  | {
      kind: 'contrato'; id: string; at: string; contractId: number; contractNumber: string | null;
      templateName: string | null; step: 'creado' | 'enviado' | 'firmado'; authorName?: string | null;
    };

export const getSalesClientTimeline = (id: number) =>
  api.get(`/ventas/clientes/${id}/timeline`).then(r => r.data as TimelineEvent[]);
export const addSalesClientActivity = (id: number, data: { type: SalesActivityType; otherLabel?: string; text: string }) =>
  api.post(`/ventas/clientes/${id}/activities`, data).then(r => r.data);
export const updateSalesClientActivity = (activityId: number, data: Partial<{ type: SalesActivityType; otherLabel: string; text: string }>) =>
  api.patch(`/ventas/clientes/activities/${activityId}`, data).then(r => r.data);
export const deleteSalesClientActivity = (activityId: number) =>
  api.delete(`/ventas/clientes/activities/${activityId}`).then(r => r.data);
// "Hecho" de la vista Hoy: lo que se hizo (opcional) + el nuevo siguiente paso.
export const markSalesClientDone = (
  id: number,
  data: { text?: string; type?: SalesActivityType; otherLabel?: string; nextActionText: string; nextActionDate: string },
) => api.post(`/ventas/clientes/${id}/hecho`, data).then(r => r.data as SalesClient);

// Texto y fecha vacíos ('') quitan el siguiente paso.
export const setSalesClientNextAction = (id: number, text: string, date: string) =>
  api.patch(`/ventas/clientes/${id}`, { nextActionText: text, nextActionDate: date }).then(r => r.data as SalesClient);

// Formulario abierto "Referir un cliente" — cualquier autenticado.
export const referirCliente = (data: { nombre: string; celular?: string; correo?: string; servicioRequerido?: string; subserviciosRequeridos?: string[]; nota?: string }) =>
  api.post('/ventas/clientes/referir', data).then(r => r.data as SalesClient);
export const misReferidosClientes = () =>
  api.get('/ventas/clientes/mis-referidos').then(r => r.data as MiReferidoCliente[]);

export const getSalesClients = () =>
  api.get('/ventas/clientes').then(r => r.data as SalesClient[]);
export const getSalesClient = (id: number) =>
  api.get(`/ventas/clientes/${id}`).then(r => r.data as SalesClient);
// `fechaIngreso` ('YYYY-MM-DD') es la fecha de creación editable: permite
// registrar prospectos de meses anteriores. No puede ser futura.
export const createSalesClient = (data: Partial<SalesClient> & { name: string; fechaIngreso?: string }) =>
  api.post('/ventas/clientes', data).then(r => r.data as SalesClient);
export const updateSalesClient = (id: number, data: Partial<SalesClient> & { fechaIngreso?: string }) =>
  api.patch(`/ventas/clientes/${id}`, data).then(r => r.data as SalesClient);
export const deleteSalesClient = (id: number) =>
  api.delete(`/ventas/clientes/${id}`).then(r => r.data);

// "Responsable" — autoasignación simple, nadie asigna el cliente de otra
// persona (ver VentasClientesService.asignarme/quitarme).
export const asignarmeSalesClient = (id: number) =>
  api.post(`/ventas/clientes/${id}/asignarme`).then(r => r.data as SalesClient);
export const quitarmeSalesClient = (id: number) =>
  api.delete(`/ventas/clientes/${id}/asignarme`).then(r => r.data as SalesClient);

export function salesClientValue(client: SalesClient | null | undefined, key: string): string {
  if (!client || !key) return '';
  if (key === 'name') return client.name || '';
  if (key === 'email') return client.email || '';
  if (key === 'phone') return client.phone || '';
  if (key === 'ruc') return client.ruc || '';
  if (key === 'address') return client.address || '';
  if (key === 'observaciones') return client.observaciones || '';
  return client.extra?.[key] != null ? String(client.extra[key]) : '';
}

// Igual que salesClientValue, pero para un campo SELECT: traduce el `key`
// guardado en extra al `label` actual de esa opción (que se puede renombrar
// sin romper el dato guardado).
export function salesClientSelectLabel(client: SalesClient | null | undefined, field: SalesClientField): string {
  const raw = salesClientValue(client, field.key);
  if (!raw) return '';
  const option = field.options?.find((o) => o.key === raw);
  return option?.label || raw;
}

// Sub-servicios disponibles para un servicio ya elegido (vacío si es "Otro",
// no está en la lista o esa opción no tiene sub-servicios).
export function subserviciosDe(servicioOptions: SalesClientFieldOption[] | undefined, servicio: string) {
  return servicioOptions?.find((o) => o.key === servicio)?.children || [];
}

// Keys guardadas ('A,B') -> lista. Tolera vacío.
export const parseSubservicios = (raw: string | undefined | null): string[] =>
  (raw || '').split(',').map((k) => k.trim()).filter(Boolean);

// "Campaña · Facebook, Instagram", o solo el nombre de la opción si no hay casillas.
// Servicio requerido antes guardaba las casillas en extra.subservicios_requeridos.
export function salesClientListaSubopcionesLabel(client: SalesClient | null | undefined, field: SalesClientField): string {
  const parent = salesClientSelectLabel(client, field);
  if (!parent) return '';
  const guardadas = salesClientValue(client, subopcionesKey(field.key));
  const keys = parseSubservicios(
    guardadas || (field.key === SERVICIO_KEY ? salesClientValue(client, SUBSERVICIOS_KEY) : ''),
  );
  if (keys.length === 0) return parent;
  const disponibles = subserviciosDe(field.options, salesClientValue(client, field.key));
  const hijos = keys.map((k) => disponibles.find((c) => c.key === k)?.label || k).join(', ');
  return hijos ? `${parent} · ${hijos}` : parent;
}

