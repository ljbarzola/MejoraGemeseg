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
  // null = documento subido ya hecho (sin plantilla): no se genera ni se envía a firma desde el sistema.
  templateId?: number | null;
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
  salesClient?: { id: number; name: string } | null;
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
export const getContracts = (params?: { status?: string; templateId?: number; sinCliente?: boolean }) =>
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

export interface SubirDocumentoInput {
  salesClientId: number;
  agreementId?: number;
  titulo?: string;
  firmado: boolean;
}

// Sube un documento que ya existe (p. ej. el contrato firmado en PDF) sin plantilla ni firma
// electrónica: crea el documento del cliente y, si se indica, lo cuelga de uno de sus contratos.
export const subirDocumentoHecho = (file: File, data: SubirDocumentoInput): Promise<SalesContract> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('salesClientId', String(data.salesClientId));
  if (data.agreementId) formData.append('agreementId', String(data.agreementId));
  if (data.titulo?.trim()) formData.append('titulo', data.titulo.trim());
  formData.append('firmado', String(data.firmado));
  return api.post('/ventas/contratos/subir', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

// ¿Está conectada la firma electrónica (SignWell)? Mientras no lo esté, enviar a firma no funciona.
export const getEstadoFirmaElectronica = (): Promise<{ signwellConfigurado: boolean }> =>
  api.get('/ventas/contratos/estado-firma').then(r => r.data);

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
  // Ciclo de vida CALCULADO (nunca se teclea): lo da el listado de clientes.
  ciclo?: CicloVida | null;
  cicloRazones?: string[];
  // Aceptó (oportunidad ganada) pero todavía no tiene contrato: «Por contratar».
  contratoPendiente?: boolean;
  // Negociaciones abiertas (un cliente con una abierta sigue siendo un
  // prospecto en el sentido de que su seguimiento se hace en Oportunidades).
  oportunidadesAbiertas?: number;
  // Siguiente paso con este cliente (vista "Hoy"). La fecha llega como ISO a
  // medianoche UTC: para compararla con "hoy" usar solo los primeros 10
  // caracteres ('YYYY-MM-DD'), nunca new Date(), que la correría de día.
  nextActionText?: string | null;
  nextActionDate?: string | null;
  createdAt: string;
  creator?: { id: number; fullName: string } | null;
  // Solo en la respuesta de crear: otros clientes con un nombre parecido
  // (aviso blando, no bloquea — Fase 2 del CRM).
  posiblesDuplicados?: { id: number; name: string }[];
}

// Fase 2 del CRM (2026-10-18): personas de contacto de un cliente, cada una
// con varios teléfonos/correos etiquetados.
export interface SalesContactValue {
  label: string;
  value: string;
}
export interface SalesContact {
  id: number;
  salesClientId: number;
  name: string;
  role?: string | null;
  phones: SalesContactValue[];
  emails: SalesContactValue[];
  notes?: string | null;
  createdAt: string;
}
export const getSalesContacts = (clientId: number): Promise<SalesContact[]> =>
  api.get(`/ventas/clientes/${clientId}/contactos`).then(r => r.data);
export const createSalesContact = (
  clientId: number,
  data: { name: string; role?: string; phones?: SalesContactValue[]; emails?: SalesContactValue[]; notes?: string },
): Promise<SalesContact> =>
  api.post(`/ventas/clientes/${clientId}/contactos`, data).then(r => r.data);
export const updateSalesContact = (
  contactId: number,
  data: Partial<{ name: string; role: string; phones: SalesContactValue[]; emails: SalesContactValue[]; notes: string }>,
): Promise<SalesContact> =>
  api.patch(`/ventas/clientes/contactos/${contactId}`, data).then(r => r.data);
export const deleteSalesContact = (contactId: number) =>
  api.delete(`/ventas/clientes/contactos/${contactId}`).then(r => r.data);

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
// Cambia la etapa de la oportunidad PRINCIPAL del cliente. Pasar a una etapa de
// pérdida exige `extra.motivo`; al cotizar se puede mandar `extra.quotedAmount`.
export const changeSalesClientStage = (
  id: number,
  toStatus: string,
  notes?: string,
  siguientePaso?: { text: string; date: string },
  extra?: { motivo?: MotivoInput; quotedAmount?: number | null },
) =>
  api.patch(`/ventas/clientes/${id}/stage`, {
    toStatus,
    notes,
    ...(siguientePaso ? { nextActionText: siguientePaso.text, nextActionDate: siguientePaso.date } : {}),
    ...(extra?.motivo ? { motivo: extra.motivo } : {}),
    ...(extra?.quotedAmount !== undefined ? { quotedAmount: extra.quotedAmount } : {}),
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

export type SalesActivityType =
  | 'NOTA' | 'LLAMADA' | 'REUNION' | 'CORREO'
  | 'COTIZACION_ENVIADA' | 'QUEJA' | 'INCIDENTE_SERVICIO' | 'CONVERSACION_SALIDA'
  | 'OTRO';

export const SALES_ACTIVITY_TYPES: { value: SalesActivityType; label: string }[] = [
  { value: 'NOTA', label: 'Nota' },
  { value: 'LLAMADA', label: 'Llamada' },
  { value: 'REUNION', label: 'Reunión' },
  { value: 'CORREO', label: 'Correo' },
  { value: 'COTIZACION_ENVIADA', label: 'Cotización enviada' },
  { value: 'QUEJA', label: 'Queja' },
  { value: 'INCIDENTE_SERVICIO', label: 'Incidente del servicio' },
  { value: 'CONVERSACION_SALIDA', label: 'Conversación de salida' },
  { value: 'OTRO', label: 'Otro' },
];

export interface TimelineStageInfo { label: string; color: string }

export type TimelineEvent =
  | {
      kind: 'creado'; id: string; at: string; authorName: string | null; referredByName: string | null;
      // Servicio por el que llegó (lo elegido en la ficha/formulario o los de su primera oportunidad) y la fuente.
      servicios?: string[]; fuente?: string | null;
    }
  | {
      kind: 'etapa'; id: string; at: string; authorName: string | null; from: TimelineStageInfo | null; to: TimelineStageInfo | null; notes: string | null;
      // De qué negociación es el cambio (no viene en los registros viejos del cliente).
      opportunityId?: number; opportunityName?: string;
    }
  | {
      kind: 'oportunidad'; id: string; at: string; authorName: string | null; opportunityId: number; nombre: string;
      servicios: string[]; originType: string; source: string | null;
    }
  | {
      kind: 'acuerdo'; id: string; at: string; agreementId: number; title: string | null; producto?: boolean; servicios: string[];
      step: 'creado' | 'renovado' | 'cancelado'; authorName?: string | null; startDate?: string; endDate?: string | null;
    }
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
// `yaEsCliente`: ya venía contratando antes de usar el sistema (queda como Cliente, «Por contratar»).
export const createSalesClient = (data: Partial<SalesClient> & { name: string; fechaIngreso?: string; yaEsCliente?: boolean; soloDatos?: boolean }) =>
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


// ==================== CONTRATOS COMERCIALES Y SERVICIOS ====================
// "Contrato" en la pantalla de Ventas = el acuerdo comercial de un cliente
// (servicios, vigencia, renovaciones). El documento que se genera y firma es
// `SalesContract` (pantalla "Documentación"). En la API los contratos
// comerciales viven bajo /ventas/acuerdos para no chocar con /ventas/contratos.
export type EstadoContrato =
  | 'POR_INICIAR'
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'RENOVADO'
  | 'CANCELADO'
  | 'POR_ENTREGAR'
  | 'ENTREGADO';

// SERVICIO = recurrente (vigencia, renovación, valor mensual). PRODUCTO = venta
// única (sin fin ni renovación; Por entregar → Entregado, garantía opcional).
export type TipoContrato = 'SERVICIO' | 'PRODUCTO';
export type EstadoGarantia = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

export interface SalesServicio {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  order: number;
  contratos?: number;
}

export interface ContratoComercialRef {
  id: number;
  title?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface ContratoComercialDocumento {
  contractId: number;
  agreementId: number;
  createdAt: string;
  contract: {
    id: number;
    contractNumber?: string | null;
    status: string;
    createdAt: string;
    signedAt?: string | null;
    template?: { name: string } | null;
  };
}

export interface ContratoComercial {
  id: number;
  salesClientId: number;
  salesClient: { id: number; name: string };
  title?: string | null;
  startDate: string;
  endDate?: string | null;
  status: 'ACTIVO' | 'RENOVADO' | 'CANCELADO' | 'POR_ENTREGAR' | 'ENTREGADO';
  estado: EstadoContrato;
  kind: TipoContrato;
  // Solo producto: valor total, fecha de entrega y garantía (opcional).
  totalValue?: number | null;
  deliveredAt?: string | null;
  warrantyUntil?: string | null;
  garantia?: EstadoGarantia | null;
  notes?: string | null;
  renewedFromId?: number | null;
  // Valor mensual (null = no registrado) y días de gracia tras el vencimiento.
  monthlyValue?: number | null;
  graceDays: number;
  cancelledAt?: string | null;
  opportunityId?: number | null;
  // Motivo del último cierre registrado (cancelación o vencido sin renovar).
  motivoCierre?: string | null;
  services: { id: number; name: string }[];
  documentos: number;
  createdAt: string;
  // Solo en el detalle:
  motivos?: MotivoRegistrado[];
  renewedFrom?: ContratoComercialRef | null;
  renewals?: ContratoComercialRef[];
  documents?: ContratoComercialDocumento[];
}

export interface ContratoComercialInput {
  salesClientId?: number;
  title?: string;
  startDate?: string;
  endDate?: string;
  serviceIds?: number[];
  notes?: string;
  kind?: TipoContrato;
  totalValue?: number | null;
  warrantyUntil?: string;
  deliveredAt?: string;
  // Servicio: solo ACTIVO (reactivar). Producto: POR_ENTREGAR o ENTREGADO.
  // Cancelar tiene su propia llamada, con motivo.
  status?: 'ACTIVO' | 'POR_ENTREGAR' | 'ENTREGADO';
  monthlyValue?: number | null;
  graceDays?: number;
  opportunityId?: number;
  // Obligatorio si el contrato baja servicios o valor frente al anterior.
  motivo?: MotivoInput;
}

export const getServicios = (incluirInactivos = false): Promise<SalesServicio[]> =>
  api.get('/ventas/servicios', { params: incluirInactivos ? { incluirInactivos: true } : undefined }).then(r => r.data);

export const createServicio = (data: { name: string; description?: string }): Promise<SalesServicio> =>
  api.post('/ventas/servicios', data).then(r => r.data);

export const updateServicio = (id: number, data: { name?: string; description?: string; isActive?: boolean }): Promise<SalesServicio> =>
  api.patch(`/ventas/servicios/${id}`, data).then(r => r.data);

export const deleteServicio = (id: number) =>
  api.delete(`/ventas/servicios/${id}`).then(r => r.data);

export const getContratosComerciales = (params?: { clienteId?: number; estado?: string; servicioId?: number; q?: string; tipo?: TipoContrato }): Promise<ContratoComercial[]> =>
  api.get('/ventas/acuerdos', { params }).then(r => r.data);

export const getContratoComercial = (id: number): Promise<ContratoComercial> =>
  api.get(`/ventas/acuerdos/${id}`).then(r => r.data);

export const createContratoComercial = (data: ContratoComercialInput): Promise<ContratoComercial> =>
  api.post('/ventas/acuerdos', data).then(r => r.data);

export const updateContratoComercial = (id: number, data: ContratoComercialInput): Promise<ContratoComercial> =>
  api.patch(`/ventas/acuerdos/${id}`, data).then(r => r.data);

export const deleteContratoComercial = (id: number) =>
  api.delete(`/ventas/acuerdos/${id}`).then(r => r.data);

export const renovarContratoComercial = (id: number, data: ContratoComercialInput): Promise<ContratoComercial> =>
  api.post(`/ventas/acuerdos/${id}/renovar`, data).then(r => r.data);

export const vincularDocumentoAContrato = (id: number, contractId: number): Promise<ContratoComercial> =>
  api.post(`/ventas/acuerdos/${id}/documentos`, { contractId }).then(r => r.data);

export const desvincularDocumentoDeContrato = (id: number, contractId: number): Promise<ContratoComercial> =>
  api.delete(`/ventas/acuerdos/${id}/documentos/${contractId}`).then(r => r.data);

export const vincularDocumentosSinCliente = (): Promise<{ revisados: number; vinculados: number; ambiguos: number; sinCoincidencia: number }> =>
  api.post('/ventas/acuerdos/documentos/vincular-clientes').then(r => r.data);

export const ESTADO_CONTRATO_LABEL: Record<EstadoContrato, string> = {
  POR_INICIAR: 'Por iniciar',
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  RENOVADO: 'Renovado',
  CANCELADO: 'Cancelado',
  POR_ENTREGAR: 'Por entregar',
  ENTREGADO: 'Entregado',
};

export const ESTADO_CONTRATO_COLOR: Record<EstadoContrato, string> = {
  POR_INICIAR: '#3b82f6',
  VIGENTE: '#059669',
  POR_VENCER: '#d97706',
  VENCIDO: '#dc2626',
  RENOVADO: '#6b7280',
  CANCELADO: '#9ca3af',
  POR_ENTREGAR: '#d97706',
  ENTREGADO: '#059669',
};

export const GARANTIA_LABEL: Record<EstadoGarantia, string> = {
  VIGENTE: 'Garantía vigente',
  POR_VENCER: 'Garantía por vencer',
  VENCIDA: 'Garantía vencida',
};

// ==================== CICLO DE VIDA, MOTIVOS, OPORTUNIDADES, LEADS Y ANALÍTICA ====================
// (2026-10-07) Un LEAD es un contacto entrante sin calificar; solo uno de servicio
// se convierte en cliente + oportunidad. Una OPORTUNIDAD es cada negociación de un
// servicio de un cliente (su embudo, monto cotizado y motivo de pérdida). El
// cliente tiene un ciclo de vida CALCULADO (nunca se teclea) y un cliente nunca
// vuelve a ser lead. En la API los leads viven bajo /ventas/entrantes porque
// /ventas/leads lo usa el módulo viejo de prospectos.

export type CicloVida = 'PROSPECTO' | 'CLIENTE' | 'EN_RIESGO' | 'EX_CLIENTE' | 'PERDIDO';

export const CICLO_LABEL: Record<CicloVida, string> = {
  PROSPECTO: 'Prospecto',
  CLIENTE: 'Cliente',
  EN_RIESGO: 'En riesgo',
  EX_CLIENTE: 'Inactivo',
  PERDIDO: 'Perdido',
};

export const CICLO_COLOR: Record<CicloVida, string> = {
  PROSPECTO: '#718096',
  CLIENTE: '#2f855a',
  EN_RIESGO: '#d97706',
  EX_CLIENTE: '#c53030',
  PERDIDO: '#a0aec0',
};

// ---------- Motivos de cierre ----------
export type MotivoKind =
  | 'LEAD_DESCARTE'
  | 'OPP_PERDIDA'
  | 'CONTRATO_CANCELADO'
  | 'CONTRATO_REDUCCION'
  | 'CONTRATO_NO_RENOVADO';

export const MOTIVO_KIND_LABEL: Record<MotivoKind, string> = {
  LEAD_DESCARTE: 'Posible cliente descartado',
  OPP_PERDIDA: 'Oportunidad perdida',
  CONTRATO_CANCELADO: 'Contrato cancelado',
  CONTRATO_REDUCCION: 'Contrato renovado con menos',
  CONTRATO_NO_RENOVADO: 'Contrato vencido sin renovar',
};

export interface SalesMotivo {
  id: number;
  label: string;
  kinds: MotivoKind[];
  isActive: boolean;
  order: number;
  requiresComment: boolean;
  isNoInfo: boolean;
  isSystem: boolean;
}

// Lo que se manda al cerrar algo: qué motivo, quién lo dijo y un comentario.
export interface MotivoInput {
  reasonId?: number;
  source?: 'CLIENTE' | 'VENDEDOR';
  comment?: string;
}

export interface MotivoRegistrado {
  id: number;
  kind: MotivoKind;
  reasonLabel: string;
  comment?: string | null;
  source?: 'CLIENTE' | 'VENDEDOR' | null;
  detail?: any;
  createdAt: string;
}

export const getMotivos = (kind?: MotivoKind, incluirInactivos = false): Promise<SalesMotivo[]> =>
  api.get('/ventas/motivos', { params: { ...(kind ? { kind } : {}), ...(incluirInactivos ? { incluirInactivos: true } : {}) } }).then(r => r.data);
export const createMotivo = (data: { label: string; kinds: MotivoKind[]; requiresComment?: boolean }): Promise<SalesMotivo> =>
  api.post('/ventas/motivos', data).then(r => r.data);
export const updateMotivo = (id: number, data: Partial<{ label: string; kinds: MotivoKind[]; requiresComment: boolean; isActive: boolean }>): Promise<SalesMotivo> =>
  api.patch(`/ventas/motivos/${id}`, data).then(r => r.data);
export const deleteMotivo = (id: number) =>
  api.delete(`/ventas/motivos/${id}`).then(r => r.data);

// ---------- Oportunidades ----------
export interface Oportunidad {
  id: number;
  salesClientId: number;
  salesClient: { id: number; name: string; email?: string | null; phone?: string | null };
  title?: string | null;
  status?: string | null;
  stage?: { key: string; label: string; color: string; isFinal: boolean; order: number } | null;
  outcome?: 'GANADA' | 'PERDIDA' | null;
  abierta: boolean;
  receivedAt: string;
  closedAt?: string | null;
  quotedAt?: string | null;
  quotedAmount?: number | null;
  assignedUserId?: number | null;
  assignedUserName?: string | null;
  source?: string | null;
  referredByUserId?: number | null;
  leadId?: number | null;
  originType: string;
  notes?: string | null;
  services: { id: number; name: string }[];
  // Solo en el detalle:
  stageChanges?: { id: number; fromStatus?: string | null; toStatus: string; notes?: string | null; createdAt: string }[];
  motivos?: MotivoRegistrado[];
}

export interface OportunidadInput {
  salesClientId?: number;
  title?: string;
  serviceIds?: number[];
  quotedAmount?: number | null;
  quotedAt?: string | null;
  notes?: string;
  assignedUserId?: number | null;
}

export interface CambioEtapaInput {
  toStatus: string;
  notes?: string;
  motivo?: MotivoInput;
  quotedAmount?: number | null;
  quotedAt?: string | null;
  nextActionText?: string | null;
  nextActionDate?: string | null;
}

export const ORIGEN_OPORTUNIDAD_LABEL: Record<string, string> = {
  LEAD: 'Posible cliente',
  MANUAL: 'Ingreso manual',
  REFERIDO: 'Referido',
  MIGRADA: 'Sistema anterior',
  CLIENTE_EXISTENTE: 'Nuevo servicio de un cliente',
  HISTORICO: 'Ya era cliente',
};

export const getOportunidades = (params?: { etapa?: string; responsableId?: number; clienteId?: number; servicioId?: number; estado?: string; q?: string }): Promise<Oportunidad[]> =>
  api.get('/ventas/oportunidades', { params }).then(r => r.data);
export const getOportunidad = (id: number): Promise<Oportunidad> =>
  api.get(`/ventas/oportunidades/${id}`).then(r => r.data);
export const createOportunidad = (data: OportunidadInput): Promise<Oportunidad> =>
// Fase 3: al ACEPTAR una oportunidad se dice qué pasa con el contrato.
// `agreementId` suma los servicios a ese contrato vigente; sin él se crea uno
// nuevo (`confirmarNuevo` cuando el cliente ya tiene contratos vigentes).
export interface AceptarContratoInput {
  tipo: 'SERVICIO' | 'PRODUCTO';
  agreementId?: number;
  confirmarNuevo?: boolean;
  garantiaMeses?: number;
}

export interface ContratoResultado {
  accion: 'CREADO' | 'AGREGADO';
  tipo: 'SERVICIO' | 'PRODUCTO';
  agreementId: number;
  titulo?: string | null;
  clienteNombre: string;
  servicios: string[];
}

  api.post('/ventas/oportunidades', data).then(r => r.data);
export const updateOportunidad = (id: number, data: OportunidadInput): Promise<Oportunidad> =>
  api.patch(`/ventas/oportunidades/${id}`, data).then(r => r.data);
export const cambiarEtapaOportunidad = (id: number, data: CambioEtapaInput): Promise<Oportunidad & { contratoResultado?: ContratoResultado }> =>
  api.patch(`/ventas/oportunidades/${id}/etapa`, data).then(r => r.data);
export const deleteOportunidad = (id: number) =>
  api.delete(`/ventas/oportunidades/${id}`).then(r => r.data);

  contrato?: AceptarContratoInput;
// ---------- Leads (bandeja de contactos entrantes) ----------
export type MotivoContacto = 'SERVICIO' | 'EMPLEO' | 'PROVEEDOR' | 'OTRO' | 'SPAM';

export const MOTIVO_CONTACTO_LABEL: Record<MotivoContacto, string> = {
  SERVICIO: 'Servicio',
  EMPLEO: 'Empleo',
  PROVEEDOR: 'Proveedor',
  OTRO: 'Otro',
  SPAM: 'Spam',
};

// Canal (fuente) de un lead. La lista viene del servidor (registro único de
// canales): sumar uno nuevo no pide tocar esta pantalla. `campos` son los datos
// propios de ese canal; `campaign` va a la columna de campaña y el resto a `extra`.
export interface CampoCanalLead { key: string; label: string; ayuda?: string }
export interface CanalLeadDef {
  key: string;
  label: string;
  grupo: 'ANUNCIO' | 'WEB' | 'DIRECTO';
  campos: CampoCanalLead[];
}
export const getCanalesLead = (): Promise<CanalLeadDef[]> =>
  api.get('/ventas/entrantes/canales').then(r => r.data);

// Leads recibidos por canal y cuándo llegó el último (lo real, no un estado escrito a mano).
export interface ActividadCanalLead { canal: string; total: number; ultimo: string | null }
export const getActividadCanalesLead = (): Promise<ActividadCanalLead[]> =>
  api.get('/ventas/entrantes/canales/actividad').then(r => r.data);

export interface LeadEntrante {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  message?: string | null;
  channel: string;
  campaign?: string | null;
  contactReason?: MotivoContacto | null;
  sugerenciaMotivo?: MotivoContacto | null;
  status: 'NUEVO' | 'EN_SEGUIMIENTO' | 'CONVERTIDO' | 'DESCARTADO';
  assignedUserId?: number | null;
  assignedUserName?: string | null;
  convertedClientId?: number | null;
  convertedOpportunityId?: number | null;
  // Lo que mandó la landing: servicio, landing, UTM, gclid, fbclid...
  extra?: Record<string, unknown> | null;
  // Servicios del catálogo que el contacto pidió en la landing (solo preselección).
  serviciosSugeridos?: number[];
  createdAt: string;
  // Parecido a un cliente que ya existe (mismo correo o teléfono).
  clienteExistente?: { id: number; name: string } | null;
  // Solo en el detalle. `contactoId`/`contactoNombre`: Fase 2, cuando lo que
  // coincide es una PERSONA de contacto (Juanito, María) y no la empresa.
  coincidencias?: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    contactoId?: number | null;
    contactoNombre?: string | null;
  }[];
  motivos?: MotivoRegistrado[];
}

export interface ConvertirLeadInput {
  salesClientId?: number;
  confirmarNuevo?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  ruc?: string;
  serviceIds?: number[];
  title?: string;
  // Fase 2: contacto reconocido en `coincidencias` (se le guarda el teléfono/
  // correo nuevo si no lo tenía) o el nombre de un contacto nuevo a registrar
  // en un cliente existente.
  contactId?: number;
  nuevoContactoNombre?: string;
}

export const getLeadsEntrantes = (params?: { estado?: string; canal?: string; motivo?: string; q?: string }): Promise<LeadEntrante[]> =>
  api.get('/ventas/entrantes', { params }).then(r => r.data);
export const getLeadEntrante = (id: number): Promise<LeadEntrante> =>
  api.get(`/ventas/entrantes/${id}`).then(r => r.data);
export const createLeadEntrante = (data: { name?: string; email?: string; phone?: string; companyName?: string; message?: string; channel?: string; campaign?: string; extra?: Record<string, string> }): Promise<LeadEntrante> =>
  api.post('/ventas/entrantes', data).then(r => r.data);
export const updateLeadEntrante = (id: number, data: Partial<{ name: string; email: string | null; phone: string | null; companyName: string | null; message: string | null; contactReason: MotivoContacto | null }>): Promise<LeadEntrante> =>
  api.patch(`/ventas/entrantes/${id}`, data).then(r => r.data);
export const tomarLeadEntrante = (id: number): Promise<LeadEntrante> =>
  api.post(`/ventas/entrantes/${id}/tomar`).then(r => r.data);
export const soltarLeadEntrante = (id: number): Promise<LeadEntrante> =>
  api.post(`/ventas/entrantes/${id}/soltar`).then(r => r.data);
export const descartarLeadEntrante = (id: number, motivo: MotivoInput): Promise<LeadEntrante> =>
  api.post(`/ventas/entrantes/${id}/descartar`, { motivo }).then(r => r.data);
export const convertirLeadEntrante = (id: number, data: ConvertirLeadInput): Promise<{ clienteId: number; oportunidadId: number; sumadaAClienteExistente: boolean; posiblesDuplicados?: { id: number; name: string }[] }> =>
  api.post(`/ventas/entrantes/${id}/convertir`, data).then(r => r.data);

// Aviso a Google Ads de qué lead cotizó (CUALIFICADO) o contrató (CONVERTIDO).
export interface ResumenConversiones {
  // false mientras el envío automático a Google no esté configurado.
  conectado: boolean;
  total: number;
  porEstado: Partial<Record<'PENDIENTE' | 'ENVIADO' | 'FALLO' | 'VENCIDO', number>>;
  porTipo: Partial<Record<'CUALIFICADO' | 'CONVERTIDO', number>>;
}
export const getResumenConversiones = (): Promise<ResumenConversiones> =>
  api.get('/ventas/conversiones/resumen').then(r => r.data);

// ---------- Configuración de Ventas y CRM (por empresa) ----------
export interface AjustesGoogleAds {
  customerId: string;
  conversionCualificado: string;
  conversionConvertido: string;
  activo: boolean;
  soloValidar: boolean;
}
export interface LandingConfig { slug: string; servicio: string; linea: string }
export interface ConfiguracionVentas {
  googleAds: AjustesGoogleAds;
  // Cuenta de servicio que hay que invitar como usuario en Google Ads.
  cuentaDeServicio: string;
  landings: LandingConfig[];
}
export const getConfiguracionVentas = (): Promise<ConfiguracionVentas> =>
  api.get('/ventas/configuracion').then(r => r.data);
export const guardarAjustesGoogleAds = (data: Partial<AjustesGoogleAds>): Promise<AjustesGoogleAds> =>
  api.put('/ventas/configuracion/google-ads', data).then(r => r.data);
export const guardarLandingsConfig = (landings: LandingConfig[]): Promise<LandingConfig[]> =>
  api.put('/ventas/configuracion/landings', { landings }).then(r => r.data);

// Claves de las conexiones (formulario web, Google Ads): reutiliza las
// api-keys que ya existían para los webhooks de Ventas.
export interface ClaveConexion { id: number; name: string; apiKey: string; isActive: boolean; createdAt: string }
export const getClavesConexion = (): Promise<ClaveConexion[]> =>
  api.get('/ventas/api-keys').then(r => r.data);
export const createClaveConexion = (name: string): Promise<ClaveConexion> =>
  api.post('/ventas/api-keys', { name }).then(r => r.data);
export const deleteClaveConexion = (id: number) =>
  api.delete(`/ventas/api-keys/${id}`).then(r => r.data);

// ---------- Analítica del tablero (cartera, retención, embudo, motivos, equipo) ----------
export interface ResumenMuestra { n: number; mediana: number | null; p75: number | null; pocasMuestras: boolean }

export interface AnaliticaCartera {
  hoy: string;
  ciclo: Record<CicloVida, number> & { total: number };
  contratos: { vigentes: number; porVencer: number; vencidosSinRenovar: number; cancelados: number; valorMensualVigente: number; sinValor: number };
  renovaciones: { d30: number; d60: number; d90: number; proximas: { id: number; clienteId: number; cliente: string; titulo?: string | null; fin: string; dias: number; valorMensual: number | null }[] };
  vencidos: { id: number; clienteId: number; cliente: string; titulo?: string | null; fin: string; diasVencido: number; enGracia: boolean; valorMensual: number | null; motivoCierre: string | null }[];
  servicios: { masContratados: { servicio: string; contratos: number; clientes: number }[]; clientesConUnServicio: number; clientesConVarios: number };
  reducciones: { ultimos90Dias: number; recientes: { id: number; cliente: string; motivo: string; source?: string | null; detail?: any; fecha: string }[] };
  bajasDelMes: { total: number; clientes: { id: number; cliente: string; fin: string }[] };
}

export interface AnaliticaRetencion {
  periodo: { desde: string; hasta: string };
  clientes: { cohorte: number; retenidos: number; tasa: number | null };
  dinero: { mrrInicial: number; mrrFinal: number; retencionBruta: number | null; retencionNeta: number | null; clientesSinValor: number };
  renovacion: { contratosQueTerminan: number; renovados: number; cancelados: number; vencidosSinRenovar: number; tasa: number | null; tasaEnDinero: number | null };
}

export interface AnaliticaEmbudo {
  periodo: { desde: string; hasta: string };
  oportunidades: number;
  conversion: { etapa: string; etiqueta: string; alcanzaron: number; convirtieron: number | null; tasa: number | null }[];
  tiempoPorEtapa: ({ etapa: string; etiqueta: string } & ResumenMuestra)[];
  velocidad: { respuestaDias: ResumenMuestra; cotizacionDias: ResumenMuestra; cicloDias: ResumenMuestra };
  cobertura: { medidas: number; de: number; historialDesde: string };
}

export interface GrupoAceptacion { nombre: string; ganadas: number; perdidas: number; n: number; tasa: number; pocasMuestras: boolean }
export interface AnaliticaAceptacion {
  periodo: { desde: string; hasta: string };
  cerradas: number;
  porFuente: GrupoAceptacion[];
  porServicio: GrupoAceptacion[];
  porResponsable: GrupoAceptacion[];
  porReferidor: GrupoAceptacion[];
}

export interface AnaliticaMotivos {
  periodo: { desde: string; hasta: string };
  porCierre: { kind: MotivoKind; etiqueta: string; total: number; items: { label: string; count: number; pct: number }[]; sinInformacionPct: number; segunVendedorPct: number; segunClientePct: number }[];
}

export interface AnaliticaActividad {
  periodo: { desde: string; hasta: string };
  semanas: string[];
  vendedores: { id: number; nombre: string; actividades: number; cambios: number; total: number; porSemana: Record<string, number> }[];
}

type RangoParams = { desde?: string; hasta?: string; alcance?: string };
export const getAnaliticaCartera = (alcance?: string): Promise<AnaliticaCartera> =>
  api.get('/ventas/analitica/cartera', { params: { alcance } }).then(r => r.data);
export const getAnaliticaRetencion = (p?: RangoParams): Promise<AnaliticaRetencion> =>
  api.get('/ventas/analitica/retencion', { params: p }).then(r => r.data);
export const getAnaliticaEmbudo = (p?: RangoParams): Promise<AnaliticaEmbudo> =>
  api.get('/ventas/analitica/embudo', { params: p }).then(r => r.data);
export const getAnaliticaAceptacion = (p?: RangoParams): Promise<AnaliticaAceptacion> =>
  api.get('/ventas/analitica/aceptacion', { params: p }).then(r => r.data);
export const getAnaliticaMotivos = (p?: RangoParams): Promise<AnaliticaMotivos> =>
  api.get('/ventas/analitica/motivos', { params: p }).then(r => r.data);
export const getAnaliticaActividad = (p?: RangoParams): Promise<AnaliticaActividad> =>
  api.get('/ventas/analitica/actividad', { params: p }).then(r => r.data);

// Cancelar un contrato y explicar cierres (exigen motivo).
export const cancelarContratoComercial = (id: number, data: { date?: string; motivo: MotivoInput }): Promise<ContratoComercial> =>
  api.post(`/ventas/acuerdos/${id}/cancelar`, data).then(r => r.data);
export const registrarCierreContrato = (id: number, motivo: MotivoInput): Promise<ContratoComercial> =>
  api.post(`/ventas/acuerdos/${id}/cierre`, { motivo }).then(r => r.data);

// ---------- Embudo de marketing (Leads -> Cotizaron -> Contrataron) ----------
// Mismos pasos que el panel «Embudo de conversión de clientes potenciales» de
// Google Ads. «Interacciones» (visitas a la página) solo las ve Google.
export interface FilaEmbudoMarketing {
  clave: string;
  leads: number;
  cualificados: number;
  convertidos: number;
  pctCualificados: number | null;
  pctConvertidos: number | null;
}
export interface AnaliticaMarketing {
  periodo: { desde: string; hasta: string };
  agrupadoPor: 'channel' | 'campana' | 'landing';
  total: FilaEmbudoMarketing;
  filas: FilaEmbudoMarketing[];
}
export const getAnaliticaMarketing = (p?: RangoParams & { agrupar?: 'channel' | 'campana' | 'landing'; canal?: string }): Promise<AnaliticaMarketing> =>
  api.get('/ventas/analitica/marketing', { params: p }).then(r => r.data);
