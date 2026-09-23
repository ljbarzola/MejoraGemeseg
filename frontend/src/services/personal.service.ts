import { api } from './auth.service';

export const getPersonalDashboard = () => api.get('/personal/dashboard').then(r => r.data);

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
// El backend rechaza propiedades fuera de lo esperado (whitelist estricto), y
// `fields` suele venir de un GET previo con `id`/`templateId` de la BD ya
// mezclados — se limpia el payload aquí para que el llamador nunca tenga que
// acordarse de hacerlo.
export const saveContractTemplateFields = (id: number, fields: ContractField[]) => api.post(`/personal/contracts/templates/${id}/fields`, {
  fields: fields.map(({ variableName, label, isRequired, systemField, order }) => ({
    variableName, label, isRequired, systemField: systemField ?? undefined, order,
  })),
}).then(r => r.data);
export const deleteContractTemplate = (id: number) => api.delete(`/personal/contracts/templates/${id}`);
export const getContractAutofill = (templateId: number, cedula: string, nombreGuardia: string): Promise<ContractAutofillField[]> =>
  api.get('/personal/contracts/autofill', { params: { templateId, cedula, nombreGuardia } }).then(r => r.data);
export const generateContract = (data: {
  templateId: number;
  cedula: string;
  nombreGuardia: string;
  fieldValues: Record<string, string>;
  guardarEn?: 'general' | 'guardia';
}) =>
  api.post('/personal/contracts/generate', data).then(r => r.data);
export const getContracts = () => api.get('/personal/contracts').then(r => r.data);
export const updateContract = (id: number, data: { status?: string; generatedUrl?: string }) => api.patch(`/personal/contracts/${id}`, data).then(r => r.data);

// generatedUrl ya viene como "/api/personal/contracts/file/..." — el origen
// se resuelve quitando el sufijo /api de VITE_API_URL, mismo patrón que
// ContratoResult.tsx en Ventas.
export const resolveContractFileUrl = (generatedUrl: string) =>
  `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '')}${generatedUrl}`;

// ==================== CAPACITACIONES ====================

export interface TrainingAttachment {
  id: number;
  trainingId: number;
  url: string;
  name: string | null;
  kind: 'DOCUMENTO' | 'EVIDENCIA';
  createdAt: string;
}

export interface Training {
  id: number;
  name: string;
  type: string;
  description: string | null;
  dueDate: string | null;
  isAnnualPlan: boolean;
  driveFolderId?: string | null;
  completed: boolean;
  completedAt: string | null;
  completedBy: number | null;
  companyId: number;
  createdAt: string;
  attachments: TrainingAttachment[];
}

export type CarpetaDecision = {
  folderAction?: 'usar_existente' | 'nuevo_nombre';
  folderName?: string;
};

export const TRAINING_TYPES: { value: string; label: string }[] = [
  { value: 'INDUCCION', label: 'Inducción' },
  { value: 'SEGURIDAD_FISICA', label: 'Seguridad física' },
  { value: 'PRIMEROS_AUXILIOS', label: 'Primeros auxilios' },
  { value: 'USO_DE_ARMAS', label: 'Uso de armas' },
  { value: 'MANEJO_DEFENSIVO', label: 'Manejo defensivo' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'OTRO', label: 'Otro' },
];

export const getTrainings = (): Promise<Training[]> => api.get('/personal/trainings').then(r => r.data);
export const createTraining = (data: { name: string; type?: string; description?: string; dueDate?: string; isAnnualPlan?: boolean } & CarpetaDecision): Promise<Training> =>
  api.post('/personal/trainings', data).then(r => r.data);
export const updateTraining = (id: number, data: Partial<{ name: string; type: string; description: string; dueDate: string; isAnnualPlan: boolean }> & CarpetaDecision): Promise<Training> =>
  api.patch(`/personal/trainings/${id}`, data).then(r => r.data);
export const deleteTraining = (id: number) => api.delete(`/personal/trainings/${id}`);
export const setTrainingCompleted = (id: number, completed: boolean): Promise<Training> =>
  api.patch(`/personal/trainings/${id}/completed`, { completed }).then(r => r.data);
export const addTrainingAttachment = (id: number, data: { url: string; name?: string; kind?: 'DOCUMENTO' | 'EVIDENCIA' }): Promise<TrainingAttachment> =>
  api.post(`/personal/trainings/${id}/attachments`, data).then(r => r.data);
export const removeTrainingAttachment = (id: number, attachmentId: number) =>
  api.delete(`/personal/trainings/${id}/attachments/${attachmentId}`);
export const uploadTrainingFile = (
  file: File,
  trainingId?: number,
  decision?: CarpetaDecision,
): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  if (trainingId) formData.append('trainingId', String(trainingId));
  if (decision?.folderAction) formData.append('folderAction', decision.folderAction);
  if (decision?.folderName) formData.append('folderName', decision.folderName);
  return api.post('/personal/trainings/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

// ==================== ALERTAS (capacitaciones) ====================

export interface PersonalAlerts {
  trainingsVencidas: Training[];
  trainingsPorVencer: Training[];
}

export const getPersonalAlerts = (): Promise<PersonalAlerts> => api.get('/personal/alerts').then(r => r.data);

// ==================== BUZÓN DE QUEJAS ====================

// Desde la Fase 5, el status es el `key` libre de un ComplaintStage editable
// por empresa (ya no un enum fijo de 5 valores) — ver ComplaintStage abajo.
export type ComplaintStatus = string;

export interface ComplaintStageChange {
  id: number;
  fromStatus: ComplaintStatus;
  toStatus: ComplaintStatus;
  notes: string | null;
  createdAt: string;
  changer?: { id: number; fullName: string };
}

export interface Complaint {
  id: number;
  description: string;
  isAnonymous: boolean;
  status: ComplaintStatus;
  customFieldValues: Record<string, string>;
  createdAt: string;
  submitter?: { id: number; fullName: string; email: string } | null;
  stageChanges?: ComplaintStageChange[];
}

export interface ComplaintFieldDefinition {
  id: number;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE';
  required: boolean;
  order: number;
}

// Etapa editable del proceso de quejas y sugerencias (Fase 5). `key` es el
// valor estable que se persiste en Complaint.status; ver ComplaintStage en
// schema.prisma.
export interface ComplaintStage {
  id: number;
  key: string;
  label: string;
  color: string;
  order: number;
  isInitial: boolean;
  isFinal: boolean;
}

export const createComplaint = (data: { description: string; isAnonymous?: boolean; customFieldValues?: Record<string, string> }): Promise<Complaint> =>
  api.post('/personal/complaints', data).then(r => r.data);
export const getAllComplaints = (): Promise<Complaint[]> => api.get('/personal/complaints').then(r => r.data);
export const changeComplaintStage = (id: number, data: { toStatus: ComplaintStatus; notes?: string }): Promise<Complaint> =>
  api.patch(`/personal/complaints/${id}/stage`, data).then(r => r.data);
export const replyComplaint = (id: number, notes: string): Promise<Complaint> =>
  api.post(`/personal/complaints/${id}/reply`, { notes }).then(r => r.data);
export const deleteComplaint = (id: number) => api.delete(`/personal/complaints/${id}`).then(r => r.data);

export const getComplaintFields = (): Promise<ComplaintFieldDefinition[]> =>
  api.get('/personal/complaint-fields').then(r => r.data);
export const createComplaintField = (data: { label: string; type?: string; required?: boolean; order?: number }): Promise<ComplaintFieldDefinition> =>
  api.post('/personal/complaint-fields', data).then(r => r.data);
export const updateComplaintField = (id: number, data: Partial<{ label: string; type: string; required: boolean; order: number }>): Promise<ComplaintFieldDefinition> =>
  api.patch(`/personal/complaint-fields/${id}`, data).then(r => r.data);
export const deleteComplaintField = (id: number) => api.delete(`/personal/complaint-fields/${id}`);

export const getComplaintStages = (): Promise<ComplaintStage[]> =>
  api.get('/personal/complaint-stages').then(r => r.data);
export const createComplaintStage = (data: { key: string; label: string; color?: string; order?: number; isInitial?: boolean; isFinal?: boolean }): Promise<ComplaintStage> =>
  api.post('/personal/complaint-stages', data).then(r => r.data);
export const updateComplaintStage = (id: number, data: Partial<{ label: string; color: string; order: number; isInitial: boolean; isFinal: boolean }>): Promise<ComplaintStage> =>
  api.patch(`/personal/complaint-stages/${id}`, data).then(r => r.data);
export const deleteComplaintStage = (id: number) => api.delete(`/personal/complaint-stages/${id}`);

export const getDriveConfig = (type?: string) => api.get('/personal/drive/config', { params: type ? { type } : {} }).then(r => r.data);
export const saveDriveConfig = (data: { driveFolderId: string; type?: string }) => api.post('/personal/drive/config', data).then(r => r.data);
export const testDriveConnection = (data?: { driveFolderId?: string; type?: string }) => api.post('/personal/drive/test', data || {}).then(r => r.data);
export const syncDriveFolder = () => api.post('/personal/drive/sync').then(r => r.data);
export const syncPersonalAdminFolder = () => api.post('/personal/drive/sync-personal-admin').then(r => r.data);
export const getDriveCompliance = (cedula: string) => api.get(`/personal/drive/compliance/${cedula}`).then(r => r.data);
export const getDriveTree = () => api.get('/personal/drive/tree').then(r => r.data);
export const deleteDriveEmployee = (cedula: string) => api.delete(`/personal/drive/employee/${cedula}`).then(r => r.data);
export const quitarGuardiaFueraDeLista = (cedula: string) => api.delete(`/personal/drive/guardia/${cedula}/lista`).then(r => r.data);
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
  cedulaVisible?: string;
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
  cedulaIngresada?: string | null;
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
// tipoContratacion: 'GUARDIA' | 'ADMINISTRATIVO' — a qué sección entra el
// postulante al contratarlo (decide carpeta destino Y cómo se nombra).
export const createJobPosition = (data: { puesto: string; descripcion?: string; camposRequeridos?: CampoRequerido[]; archivosRequeridos?: ArchivoRequerido[]; estado?: string; tipoContratacion?: string }) => api.post('/personal/reclutamiento/puestos', data).then(r => r.data);
export const updateJobPosition = (id: number, data: { puesto?: string; descripcion?: string; camposRequeridos?: CampoRequerido[]; archivosRequeridos?: ArchivoRequerido[]; estado?: string; tipoContratacion?: string }) => api.patch(`/personal/reclutamiento/puestos/${id}`, data).then(r => r.data);
export const deleteJobPosition = (id: number) => api.delete(`/personal/reclutamiento/puestos/${id}`);

// --- Análisis con IA del "archivo único" de un postulante ---
// La IA solo PROPONE; nada se escribe en Drive hasta que RRHH confirma con
// aplicarAnalisisArchivoUnico. Ver ReclutamientoIaService en el backend.
export interface DocumentoDetectado {
  requisito: string;
  paginaInicio: number | null;
  paginaFin: number | null;
  confianza: 'alta' | 'media' | 'baja';
  probabilidad?: number | null;
  notas: string | null;
}

export interface AnalisisArchivoUnico {
  success: boolean;
  reason?: string;
  message?: string;
  archivo?: { id: string; name: string };
  totalPaginas?: number;
  documentos?: DocumentoDetectado[];
  paginasSinClasificar?: number[];
  // Nombres de los documentos requeridos, presentes incluso cuando la IA
  // falló — para que RRHH pueda etiquetar las páginas a mano igual.
  requisitos?: string[];
  desdeCache?: boolean;
  guardadoEn?: string;
}

// El endpoint no tiene @Body() (recibe todo por :folderId/?driveFileId), pero el
// body SÍ importa a nivel de transporte: axios serializa `null` como el texto
// literal "null", y el body-parser de Express (modo estricto, el default) sólo
// acepta un objeto o un array como JSON de nivel superior — un `null` desnudo
// lo rechaza con 400 antes de que la petición llegue al controller. Se manda
// `{}` (objeto vacío), que sí es válido, en vez de `null`.
export const analizarArchivoUnico = (folderId: string, driveFileId?: string): Promise<AnalisisArchivoUnico> =>
  api.post(`/personal/reclutamiento/candidatos/${folderId}/analizar`, {}, { params: driveFileId ? { driveFileId } : undefined }).then(r => r.data);

export interface RevisionRequerido {
  requisito: string;
  driveFileId: string;
  fileName: string;
  confianza: 'alta' | 'media' | 'baja' | null;
  probabilidad: number | null;
  notas: string | null;
}

export interface RevisionAdicional {
  driveFileId: string;
  fileName: string;
  descripcion: string | null;
}

export interface RevisionArchivos {
  success: boolean;
  reason?: string;
  message?: string;
  requeridos?: RevisionRequerido[];
  adicionales?: RevisionAdicional[];
  guardadoEn?: string;
  desdeCache?: boolean;
}

export const revisarArchivosCandidato = (
  folderId: string,
  requeridos: { requisito: string; driveFileId: string }[],
  adicionales: { driveFileId: string }[],
): Promise<RevisionArchivos> =>
  api.post(`/personal/reclutamiento/candidatos/${folderId}/revisar-archivos`, { requeridos, adicionales }).then(r => r.data);

export const obtenerRevisionArchivos = (folderId: string): Promise<RevisionArchivos> =>
  api.get(`/personal/reclutamiento/candidatos/${folderId}/revision-archivos`).then(r => r.data);

// Última propuesta guardada (si hay una), SIN llamar a Vertex AI. Se consulta
// antes de analizar: si RRHH cerró el modal para revisar otra cosa y vuelve,
// evita repetir la llamada a la IA.
export const obtenerAnalisisPendiente = (folderId: string, driveFileId?: string): Promise<AnalisisArchivoUnico> =>
  api.get(`/personal/reclutamiento/candidatos/${folderId}/analisis-pendiente`, { params: driveFileId ? { driveFileId } : undefined }).then(r => r.data);

// `paginas` es una lista, no un rango: la pantalla de revisión etiqueta página
// por página, así que un documento puede quedar formado por páginas no
// consecutivas y aun así salir como un solo archivo.
export const aplicarAnalisisArchivoUnico = (
  folderId: string,
  asignaciones: { requisito: string; paginas: number[] }[],
  driveFileId?: string,
) => api.post(`/personal/reclutamiento/candidatos/${folderId}/aplicar-analisis`, { asignaciones, driveFileId }).then(r => r.data);

// El PDF se pide al backend (no a Drive directo): los archivos viven detrás de
// la service account y además así viaja el JWT del usuario.
export const getCandidatoPdf = (folderId: string, driveFileId: string): Promise<ArrayBuffer> =>
  api.get(`/personal/reclutamiento/candidatos/${folderId}/pdf/${driveFileId}`, { responseType: 'arraybuffer' }).then(r => r.data);
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
export const approveAsAdditionalDocument = (driveFileId: string, label: string) => api.patch(`/personal/drive/documents/${driveFileId}/approve-additional`, { label }).then(r => r.data);
export const reassignReclutamientoFile = (driveFileId: string, archivoNombre: string) => api.patch(`/personal/reclutamiento/documentos/${driveFileId}/reassign`, { archivoNombre }).then(r => r.data);
export const saveCandidatoDatos = (folderId: string, datos: Record<string, string>) => api.patch(`/personal/reclutamiento/candidatos/${folderId}/datos`, { datos }).then(r => r.data);
export const contratarCandidato = (folderId: string) => api.post(`/personal/reclutamiento/candidatos/${folderId}/contratar`).then(r => r.data);

// ==================== ENCUESTAS ====================

export type SurveyQuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RATING';
export type SurveyStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export const SURVEY_QUESTION_TYPES: { value: SurveyQuestionType; label: string }[] = [
  { value: 'SHORT_TEXT', label: 'Texto corto' },
  { value: 'LONG_TEXT', label: 'Texto largo' },
  { value: 'SINGLE_CHOICE', label: 'Opción única' },
  { value: 'MULTIPLE_CHOICE', label: 'Opción múltiple' },
  { value: 'RATING', label: 'Escala (1-5)' },
];

export interface SurveyQuestion {
  id: number;
  label: string;
  type: SurveyQuestionType;
  options: string[] | null;
  required: boolean;
  order: number;
}

export interface SurveyQuestionInput {
  label: string;
  type: SurveyQuestionType;
  options?: string[];
  required?: boolean;
  order?: number;
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  // Enlace público: cuando publicEnabled es true, publicToken arma la URL
  // /encuesta/<token> que responde cualquiera sin cuenta.
  publicEnabled?: boolean;
  publicToken?: string | null;
  createdAt: string;
  creator?: { id: number; fullName: string };
  _count?: { recipients: number; responses: number };
  questions?: SurveyQuestion[];
  recipients?: { id: number; user: { id: number; fullName: string; email: string }; respondedAt: string | null }[];
}

export interface SurveyResultQuestion {
  questionId: number;
  label: string;
  type: SurveyQuestionType;
  responseCount: number;
  counts?: Record<string, number>;
  average?: number | null;
  distribution?: Record<number, number>;
  textAnswers?: string[];
}

export interface SurveyResults {
  surveyId: number;
  title: string;
  status: SurveyStatus;
  totalRecipients: number;
  totalResponses: number;
  questions: SurveyResultQuestion[];
}

export const getSurveys = (): Promise<Survey[]> => api.get('/personal/surveys').then(r => r.data);
export const getSurvey = (id: number): Promise<Survey> => api.get(`/personal/surveys/${id}`).then(r => r.data);
export const createSurvey = (data: {
  title: string;
  description?: string;
  questions: SurveyQuestionInput[];
  recipientUserIds: number[];
  publicEnabled?: boolean;
  guardarComoBorrador?: boolean;
}): Promise<Survey> => api.post('/personal/surveys', data).then(r => r.data);

export const publishSurvey = (id: number): Promise<Survey> =>
  api.patch(`/personal/surveys/${id}/publish`).then(r => r.data);

export const setSurveyPublicLink = (id: number, enabled: boolean): Promise<Survey> =>
  api.patch(`/personal/surveys/${id}/public-link`, { enabled }).then(r => r.data);
export const closeSurvey = (id: number): Promise<Survey> => api.patch(`/personal/surveys/${id}/close`).then(r => r.data);
export const reopenSurvey = (id: number): Promise<Survey> => api.patch(`/personal/surveys/${id}/reopen`).then(r => r.data);
export const deleteSurvey = (id: number) => api.delete(`/personal/surveys/${id}`);
export const getSurveyResults = (id: number): Promise<SurveyResults> => api.get(`/personal/surveys/${id}/results`).then(r => r.data);

export interface SurveyIndividualAnswer {
  questionId: number;
  questionLabel: string;
  valueText: string | null;
  valueJson: unknown;
}

export interface SurveyIndividualResponse {
  /** Id de la respuesta. `respondentId` es null en las que llegan por enlace. */
  id: number;
  respondentId: number;
  respondentName: string;
  respondentEmail: string;
  submittedAt: string;
  answers: SurveyIndividualAnswer[];
}

export interface SurveyIndividualResults {
  surveyId: number;
  title: string;
  status: SurveyStatus;
  totalRecipients: number;
  totalResponses: number;
  questions: { questionId: number; label: string; type: SurveyQuestionType; options: string[] | null }[];
  responses: SurveyIndividualResponse[];
}

export const getSurveyIndividualResults = (id: number): Promise<SurveyIndividualResults> =>
  api.get(`/personal/surveys/${id}/individual-results`).then(r => r.data);

export const getPendingSurveys = (): Promise<{ id: number; title: string; description: string | null; createdAt: string }[]> =>
  api.get('/personal/surveys/pending/mine').then(r => r.data);
export const getSurveyToRespond = (id: number): Promise<Survey & { alreadyResponded: boolean }> =>
  api.get(`/personal/surveys/${id}/respond`).then(r => r.data);
export const submitSurveyResponse = (id: number, answers: { questionId: number; valueText?: string; valueJson?: unknown }[]) =>
  api.post(`/personal/surveys/${id}/respond`, { answers }).then(r => r.data);
