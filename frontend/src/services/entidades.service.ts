import { api } from './auth.service';

export type EntidadTipo = 'PUBLICA' | 'PRIVADA';

export interface Entidad {
  id: number;
  nombre: string;
  tipo: EntidadTipo;
  activo: boolean;
  companyId: number;
  createdAt: string;
  updatedAt: string;
}

export type RequisitoAplicaA = 'GLOBAL' | 'PUBLICA' | 'PRIVADA' | 'ENTIDAD';
export type DuracionUnidad = 'DIAS' | 'MESES' | 'ANIOS';
export type AnticipacionUnidad = 'DIAS' | 'SEMANAS' | 'MESES';

export interface RequisitoDocumento {
  id: number;
  nombre: string;
  aplicaA: RequisitoAplicaA;
  entidadId: number | null;
  entidad?: Entidad | null;
  // Cada cuánto vence este tipo de documento. null = no vence / no aplica.
  duracionValor: number | null;
  duracionUnidad: DuracionUnidad | null;
  // Con cuánta anticipación avisar antes del vencimiento.
  anticipacionValor: number;
  anticipacionUnidad: AnticipacionUnidad;
  companyId: number;
  createdAt: string;
}

// Historial de solo lectura: lo genera el sync de Drive (Listado de
// Guardias → "Sincronizar Drive"), nunca se crea a mano.
export interface AsignacionGuardia {
  id: number;
  cedula: string;
  nombreGuardia: string;
  entidadId: number;
  entidad?: Entidad;
  fechaInicio: string;
  fechaFin: string | null;
  companyId: number;
  createdBy: number;
  createdAt: string;
}

export type RequisitoEstado = 'CUMPLIDO' | 'FALTANTE' | 'VENCIDO' | 'POR_VENCER';

export interface DocumentoCumplimiento {
  id: number;
  fileName: string;
  fileUrl: string;
  driveFileId: string;
  issueDate: string | null;
  expiryDate: string | null;
}

export interface RequisitoConEstado {
  requisito: RequisitoDocumento;
  estado: RequisitoEstado;
  documento?: DocumentoCumplimiento;
}

export interface ComplianceGuardiaDetail {
  cedula: string;
  tieneAsignacion: boolean;
  mensaje: string | null;
  asignacion: AsignacionGuardia | null;
  entidad: Entidad | null;
  requisitos: RequisitoConEstado[];
}

export interface ComplianceOverviewItem {
  asignacion: AsignacionGuardia;
  entidad: Entidad;
  requisitosFaltantes: RequisitoConEstado[];
  requisitosVencidos: RequisitoConEstado[];
  requisitosPorVencer: RequisitoConEstado[];
  totalRequisitos: number;
  cumplidos: number;
}

// ENTIDADES

export const getEntidades = (): Promise<Entidad[]> =>
  api.get('/personal/entidades').then((r) => r.data);

export const createEntidad = (data: { nombre: string; tipo: EntidadTipo; activo?: boolean }): Promise<Entidad> =>
  api.post('/personal/entidades', data).then((r) => r.data);

export const updateEntidad = (
  id: number,
  data: Partial<{ nombre: string; tipo: EntidadTipo; activo: boolean }>,
): Promise<Entidad> => api.patch(`/personal/entidades/${id}`, data).then((r) => r.data);

// FUSIÓN DE CÉDULAS DUPLICADAS (solo ADMIN — ver AGENTS.md, operación
// irreversible sobre datos reales; siempre revisar preview() antes de mergeCedulas()).

export interface CedulaMergePreview {
  folderOrigen: { employeeName: string; cedula: string; folderUrl: string } | null;
  folderDestino: { employeeName: string; cedula: string; folderUrl: string } | null;
  conteos: Record<string, number>;
  colisiones: Record<string, boolean>;
  puedeFusionar: boolean;
}

export interface CedulaMergeResult {
  cedulaOrigen: string;
  cedulaDestino: string;
  nombreDestino: string;
  resumen: Record<string, number>;
}

export interface CedulaMergeLog {
  id: number;
  cedulaOrigen: string;
  cedulaDestino: string;
  nombreDestino: string;
  resumen: Record<string, number>;
  mergedAt: string;
  merger: { id: number; fullName: string };
}

export const previewCedulaMerge = (cedulaOrigen: string, cedulaDestino: string): Promise<CedulaMergePreview> =>
  api.get('/personal/cedula-merge/preview', { params: { cedulaOrigen, cedulaDestino } }).then((r) => r.data);

export const mergeCedulas = (cedulaOrigen: string, cedulaDestino: string): Promise<CedulaMergeResult> =>
  api.post('/personal/cedula-merge', { cedulaOrigen, cedulaDestino }).then((r) => r.data);

export const getCedulaMergeHistorial = (): Promise<CedulaMergeLog[]> =>
  api.get('/personal/cedula-merge/historial').then((r) => r.data);

export const deleteEntidad = (id: number) => api.delete(`/personal/entidades/${id}`);

// REQUISITOS DE DOCUMENTO

export const getRequisitos = (params?: { aplicaA?: string; entidadId?: number }): Promise<RequisitoDocumento[]> =>
  api.get('/personal/requisitos-documento', { params }).then((r) => r.data);

export const createRequisito = (data: {
  nombre: string;
  aplicaA: RequisitoAplicaA;
  entidadId?: number;
  duracionValor?: number | null;
  duracionUnidad?: DuracionUnidad | null;
  anticipacionValor?: number;
  anticipacionUnidad?: AnticipacionUnidad;
}): Promise<RequisitoDocumento> => api.post('/personal/requisitos-documento', data).then((r) => r.data);

export const updateRequisito = (
  id: number,
  data: Partial<{
    nombre: string;
    aplicaA: RequisitoAplicaA;
    entidadId: number;
    duracionValor: number | null;
    duracionUnidad: DuracionUnidad | null;
    anticipacionValor: number;
    anticipacionUnidad: AnticipacionUnidad;
  }>,
): Promise<RequisitoDocumento> => api.patch(`/personal/requisitos-documento/${id}`, data).then((r) => r.data);

export const deleteRequisito = (id: number) => api.delete(`/personal/requisitos-documento/${id}`);

// ASIGNACIONES DE GUARDIAS (historial de solo lectura, generado por el sync
// de Drive — ver syncEntidadesFolder más abajo)

export const getAsignaciones = (params?: {
  cedula?: string;
  entidadId?: number;
  activasOnly?: boolean;
}): Promise<AsignacionGuardia[]> => api.get('/personal/asignaciones', { params }).then((r) => r.data);

export const getHistorialAsignaciones = (cedula: string): Promise<AsignacionGuardia[]> =>
  api.get(`/personal/asignaciones/guardia/${cedula}/historial`).then((r) => r.data);

// Válvula de seguridad: elimina una fila del historial si el sync generó
// algo erróneo por una mala configuración temporal de Drive. No es el flujo
// normal — el historial se mantiene solo con cada sincronización.
export const deleteAsignacion = (id: number) => api.delete(`/personal/asignaciones/${id}`);

// CUMPLIMIENTO POR ENTIDAD

export const getComplianceOverview = (): Promise<ComplianceOverviewItem[]> =>
  api.get('/personal/cumplimiento-entidades').then((r) => r.data);

export const getComplianceForGuardia = (cedula: string): Promise<ComplianceGuardiaDetail> =>
  api.get(`/personal/cumplimiento-entidades/${cedula}`).then((r) => r.data);

// VENCIMIENTO DE DOCUMENTOS (Fase A: carga manual por RRHH)

export const updateDocumentExpiry = (
  driveFileId: string,
  data: { issueDate?: string; expiryDate?: string },
) => api.patch(`/personal/drive/documents/${driveFileId}/expiry`, data).then((r) => r.data);

// LECTURA DE FECHA POR IA (Fase B: solo propone, RRHH confirma/corrige y
// guarda con updateDocumentExpiry de arriba — este endpoint nunca persiste).

export type ExtractExpiryReason = 'SIN_TEXTO' | 'RESPUESTA_INVALIDA' | 'ERROR_DRIVE' | 'ERROR_IA';

export interface ExtractExpiryResult {
  success: boolean;
  reason?: ExtractExpiryReason;
  message?: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  confianza?: 'alta' | 'media' | 'baja';
  notas?: string | null;
  textoExtraido?: string;
}

export const extractDocumentExpiry = (driveFileId: string): Promise<ExtractExpiryResult> =>
  api.post(`/personal/drive/documents/${driveFileId}/extract-expiry`).then((r) => r.data);

// RECORDATORIOS DE VENCIMIENTO (envío manual y personalizado por guardia —
// sin cron automático: RRHH decide a quién y cuándo notificar).

export type MedioRecordatorio = 'EMAIL' | 'WHATSAPP';

export interface RecordatorioResult {
  enviado: boolean;
  cantidadNotificada: number;
  message?: string;
}

export const enviarRecordatorio = (cedula: string, medio: MedioRecordatorio): Promise<RecordatorioResult> =>
  api.post(`/personal/cumplimiento-entidades/guardia/${cedula}/enviar-recordatorio`, { medio }).then((r) => r.data);

// CONTACTO DEL GUARDIA (correo para recordatorios, independiente de la
// entidad en la que esté hoy — sobrevive a que rote de entidad)

export interface GuardiaContacto {
  id: number;
  cedula: string;
  email: string;
  companyId: number;
  updatedAt: string;
}

export const getGuardiaContacto = (cedula: string): Promise<GuardiaContacto | null> =>
  api.get(`/personal/guardia-contacto/${cedula}`).then((r) => r.data);

export const setGuardiaContacto = (cedula: string, email: string): Promise<GuardiaContacto> =>
  api.patch(`/personal/guardia-contacto/${cedula}`, { email }).then((r) => r.data);

// FICHA PERSONAL (datos editables desde la app — nunca desde Drive. Es la
// fuente de la verdad del .json "Datos_Personales" que se crea/actualiza en
// la carpeta del guardia al sincronizar Drive.)

export interface GuardiaFichaPersonal {
  cedula: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  fechaNacimiento: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaTelefono: string | null;
  horario: string | null;
  puestoFormal: string | null;
  salarioAcordado: number | null;
  camposPersonalizados: Record<string, string>;
  // Calculado desde el último MovimientoPersonal del guardia (ver
  // MovimientoPersonalService.isActivo) — no depende de que exista fila de
  // ficha, siempre viene presente.
  activo: boolean;
  updatedAt?: string;
}

export interface UpdateGuardiaFichaPersonalInput {
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  fechaNacimiento?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  horario?: string | null;
  puestoFormal?: string | null;
  salarioAcordado?: number | null;
  camposPersonalizados?: Record<string, string>;
}

export const getGuardiaFicha = (cedula: string): Promise<GuardiaFichaPersonal> =>
  api.get(`/personal/guardia-ficha/${cedula}`).then((r) => r.data);

export const setGuardiaFicha = (
  cedula: string,
  data: UpdateGuardiaFichaPersonalInput,
): Promise<GuardiaFichaPersonal> => api.patch(`/personal/guardia-ficha/${cedula}`, data).then((r) => r.data);

// CAMPOS PERSONALIZADOS DE LA FICHA PERSONAL — creables desde la UI por
// cualquier usuario con acceso al módulo (ver PersonalFieldsConfigModal).

export type PersonalFieldType = 'TEXT' | 'NUMBER' | 'DATE';
export type PersonalFieldScope = 'GUARDIA' | 'PERSONAL_ADMIN';
export type PersonalFieldCategory = 'PERSONAL' | 'LABORAL';

export interface PersonalFieldDefinition {
  id: number;
  key: string;
  label: string;
  type: PersonalFieldType;
  category: PersonalFieldCategory;
  order: number;
}

export const getPersonalFieldDefinitions = (scope: PersonalFieldScope = 'GUARDIA'): Promise<PersonalFieldDefinition[]> =>
  api.get('/personal/personal-field-definitions', { params: { scope } }).then((r) => r.data);

export const createPersonalFieldDefinition = (data: { label: string; type: PersonalFieldType; scope?: PersonalFieldScope; category?: PersonalFieldCategory }): Promise<PersonalFieldDefinition> =>
  api.post('/personal/personal-field-definitions', data).then((r) => r.data);

export const updatePersonalFieldDefinition = (id: number, data: { label?: string; order?: number }): Promise<PersonalFieldDefinition> =>
  api.patch(`/personal/personal-field-definitions/${id}`, data).then((r) => r.data);

export const deletePersonalFieldDefinition = (id: number) => api.delete(`/personal/personal-field-definitions/${id}`);

// SYNC DE LA CARPETA DE ENTIDADES (Raíz → Público/Privado → Entidad →
// Guardia). Configurada desde Listado de Guardias.

export interface SyncEntidadesResult {
  entidadesCreadas: string[];
  entidadesRenombradas: string[];
  entidadesTipoDistinto: string[];
  entidadesColisionNombre: string[];
  guardiasActualizados: number;
  documentos: number;
  fichasPersonales: number;
  asignacionesAbiertas: number;
  asignacionesCerradas: number;
  carpetasNoReconocidas: string[];
  guardiasNoReconocidos: string[];
  renombresIgnorados: string[];
  guardiasFueraConCarpetaActiva: string[];
  errors: string[];
}

export const syncEntidadesFolder = (): Promise<SyncEntidadesResult> =>
  api.post('/personal/drive/sync-entidades').then((r) => r.data);

// ASIGNAR/MOVER GUARDIA A ENTIDAD — mueve la carpeta del guardia en Drive a
// Público/Privado/<entidad destino> y sincroniza de inmediato (ver
// DriveService.moverGuardiaAEntidad). Drive sigue siendo la fuente de la
// verdad: esto no crea la AsignacionGuardia directamente, la deja abierta
// el sync que corre justo después, en el mismo request.
export interface MoverGuardiaEntidadResult {
  movimiento: { cedula: string; folderId: string; movidoA: string };
  sync: SyncEntidadesResult;
}

export const moverGuardiaAEntidad = (
  cedula: string,
  entidadId: number,
): Promise<MoverGuardiaEntidadResult> =>
  api.post(`/personal/drive/guardia/${cedula}/mover-entidad`, { entidadId }).then((r) => r.data);
