import { api } from './auth.service';
import type {
  CPEntidadPublica,
  CPEntidadGuardada,
  CPEntidadCampo,
  TipoCampoEntidad,
  CPSyncEntidadesDrive,
  CPContrato,
  CPContratoAdenda,
  CPContratoAdjunto,
  CPPuestoServicio,
  CPPuestoGuardia,
  CPCodigoTurno,
  CPHorarioMensual,
  CPHorarioCelda,
  CPInformeMensual,
  CPTextoInstitucional,
  CPPlantillaInforme,
  CPDatosAutogeneradosInforme,
  CPPatronRotacion,
  TramoPatron,
  GuardiaOrdenPatron,
  PreviewPatronResultado,
  CPSolicitudesDeEntidad,
  CPSolicitudMensual,
  CPCarpetaEntregas,
  CPHistorialEntrega,
  CPDocumentoBandeja,
} from '../types/contratacion-publica';

const BASE = '/contratacion-publica';

// ==================== ENTIDADES PÚBLICAS ====================

export const getEntidadesPublicas = (incluirArchivadas = false): Promise<CPEntidadPublica[]> =>
  api
    .get(`${BASE}/entidades`, { params: incluirArchivadas ? { archivadas: 'true' } : undefined })
    .then((r) => r.data);

export const getEntidadPublica = (id: number): Promise<CPEntidadPublica> =>
  api.get(`${BASE}/entidades/${id}`).then((r) => r.data);

export interface CPEntidadPayload {
  nombre: string;
  ruc?: string;
  direccion?: string;
  camposExtra?: Record<string, string | number | null>;
}

export const createEntidadPublica = (data: CPEntidadPayload): Promise<CPEntidadGuardada> =>
  api.post(`${BASE}/entidades`, data).then((r) => r.data);

export const updateEntidadPublica = (
  id: number,
  data: Partial<CPEntidadPayload>,
): Promise<CPEntidadGuardada> => api.patch(`${BASE}/entidades/${id}`, data).then((r) => r.data);

// No hay "eliminar entidad": desde 2026-10-05 solo se archiva (decisión explícita).
export const archivarEntidadPublica = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/archivar`).then((r) => r.data);

export const reactivarEntidadPublica = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/reactivar`).then((r) => r.data);

/** Aviso de la sincronización "carpeta sin entidad" → crear la entidad con el nombre de la carpeta. */
export const crearEntidadDesdeCarpeta = (folderId: string): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/desde-carpeta`, { folderId }).then((r) => r.data);

/** Aviso de la sincronización "entidad sin carpeta" → crear su carpeta en Drive. */
export const crearCarpetaEntidad = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/drive/crear-carpeta`).then((r) => r.data);

// ---- campos configurables de la entidad ----

export const getCamposEntidad = (): Promise<CPEntidadCampo[]> =>
  api.get(`${BASE}/entidad-campos`).then((r) => r.data);

export const createCampoEntidad = (data: {
  nombre: string;
  tipo: TipoCampoEntidad;
  opciones?: string[];
  obligatorio?: boolean;
}): Promise<CPEntidadCampo> => api.post(`${BASE}/entidad-campos`, data).then((r) => r.data);

export const updateCampoEntidad = (
  id: number,
  data: Partial<{ nombre: string; opciones: string[]; obligatorio: boolean; activo: boolean }>,
): Promise<CPEntidadCampo> => api.patch(`${BASE}/entidad-campos/${id}`, data).then((r) => r.data);

export const reordenarCamposEntidad = (ids: number[]): Promise<CPEntidadCampo[]> =>
  api.post(`${BASE}/entidad-campos/reordenar`, { ids }).then((r) => r.data);

// Sincronización con la carpeta raíz de Drive de Contratación Pública.
export const sincronizarEntidadesDrive = (): Promise<CPSyncEntidadesDrive> =>
  api.post(`${BASE}/entidades/sincronizar-drive`).then((r) => r.data);

/** La entidad toma el nombre que tiene su carpeta en Drive. */
export const usarNombreDeDrive = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/drive/usar-nombre-de-drive`).then((r) => r.data);

/** La carpeta de Drive vuelve a llamarse como la entidad. */
export const usarNombreDelSistema = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/drive/usar-nombre-del-sistema`).then((r) => r.data);

export const recrearCarpetaEntidad = (id: number): Promise<CPEntidadPublica> =>
  api.post(`${BASE}/entidades/${id}/drive/recrear-carpeta`).then((r) => r.data);

// ==================== CONTRATOS ====================

export const getContratos = (params?: { estado?: string; entidadId?: number }): Promise<CPContrato[]> =>
  api.get(`${BASE}/contratos`, { params }).then((r) => r.data);

export const getContrato = (id: number): Promise<CPContrato> =>
  api.get(`${BASE}/contratos/${id}`).then((r) => r.data);

export const createContrato = (data: {
  entidadId: number;
  numero: string;
  objeto: string;
  referenciaProceso?: string;
  fechaInicio: string;
  fechaFin: string;
  valorTotal?: number;
}): Promise<CPContrato> => api.post(`${BASE}/contratos`, data).then((r) => r.data);

export const updateContrato = (
  id: number,
  data: Partial<{
    entidadId: number;
    numero: string;
    objeto: string;
    referenciaProceso: string;
    fechaInicio: string;
    fechaFin: string;
    valorTotal: number;
    estado: string;
  }>,
): Promise<CPContrato> => api.patch(`${BASE}/contratos/${id}`, data).then((r) => r.data);

export const deleteContrato = (id: number) => api.delete(`${BASE}/contratos/${id}`);

export const renovarContrato = (
  id: number,
  data: {
    numero: string;
    objeto?: string;
    referenciaProceso?: string;
    fechaInicio: string;
    fechaFin: string;
    valorTotal?: number;
  },
): Promise<CPContrato> => api.post(`${BASE}/contratos/${id}/renovar`, data).then((r) => r.data);

export const addAdendaContrato = (
  id: number,
  data: { numero: string; descripcion?: string; fechaInicio?: string; fechaFin?: string; archivoUrl?: string },
): Promise<CPContratoAdenda> => api.post(`${BASE}/contratos/${id}/adendas`, data).then((r) => r.data);

export const removeAdendaContrato = (id: number, adendaId: number) =>
  api.delete(`${BASE}/contratos/${id}/adendas/${adendaId}`);

export const addAdjuntoContrato = (
  id: number,
  file: File,
  tipo?: string,
): Promise<CPContratoAdjunto> => {
  const formData = new FormData();
  formData.append('file', file);
  if (tipo) formData.append('tipo', tipo);
  return api
    .post(`${BASE}/contratos/${id}/adjuntos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const removeAdjuntoContrato = (id: number, adjuntoId: number) =>
  api.delete(`${BASE}/contratos/${id}/adjuntos/${adjuntoId}`);

// Mismo patrón que `resolveContractFileUrl` en `personal.service.ts`: el
// filePath que devuelve el backend ya trae el prefijo `/api/...`, así que se
// resuelve quitando el sufijo `/api` de VITE_API_URL en vez de duplicarlo.
export const resolveContratoFileUrl = (filePath: string): string =>
  `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '')}${filePath}`;

// ==================== PUESTOS DE SERVICIO ====================

export const getPuestosByContrato = (contratoId: number): Promise<CPPuestoServicio[]> =>
  api.get(`${BASE}/puestos`, { params: { contratoId } }).then((r) => r.data);

export const getPuesto = (id: number): Promise<CPPuestoServicio> =>
  api.get(`${BASE}/puestos/${id}`).then((r) => r.data);

export const createPuesto = (data: {
  contratoId: number;
  nombre: string;
  tipoTurno: string;
  cantidadGuardias?: number;
  guardiasSimultaneosRequeridos?: number;
}): Promise<CPPuestoServicio> => api.post(`${BASE}/puestos`, data).then((r) => r.data);

export const updatePuesto = (
  id: number,
  data: Partial<{
    nombre: string;
    tipoTurno: string;
    cantidadGuardias: number;
    guardiasSimultaneosRequeridos: number;
  }>,
): Promise<CPPuestoServicio> => api.patch(`${BASE}/puestos/${id}`, data).then((r) => r.data);

export const deletePuesto = (id: number) => api.delete(`${BASE}/puestos/${id}`);

export const asignarGuardiaPuesto = (
  id: number,
  data: { cedula: string; nombreGuardia: string },
): Promise<CPPuestoGuardia> => api.post(`${BASE}/puestos/${id}/guardias`, data).then((r) => r.data);

export const removeGuardiaPuesto = (id: number, guardiaId: number) =>
  api.delete(`${BASE}/puestos/${id}/guardias/${guardiaId}`);

// ==================== PATRÓN DE ROTACIÓN ====================

export interface PatronRotacionConfig {
  tramos: TramoPatron[];
  coberturaSimultanea: number;
  ordenGuardias: GuardiaOrdenPatron[];
  fechaInicioCiclo: string;
}

export const getPatronRotacion = (puestoId: number): Promise<CPPatronRotacion | null> =>
  api.get(`${BASE}/puestos/${puestoId}/patron-rotacion`).then((r) => r.data);

export const guardarPatronRotacion = (
  puestoId: number,
  data: PatronRotacionConfig,
): Promise<CPPatronRotacion> =>
  api.put(`${BASE}/puestos/${puestoId}/patron-rotacion`, data).then((r) => r.data);

export const previewPatronRotacion = (
  puestoId: number,
  data: PatronRotacionConfig & { fechaInicio: string; fechaFin: string },
): Promise<PreviewPatronResultado> =>
  api.post(`${BASE}/puestos/${puestoId}/patron-rotacion/preview`, data).then((r) => r.data);

// ==================== CÓDIGOS DE TURNO ====================

export const getCodigosTurno = (): Promise<CPCodigoTurno[]> =>
  api.get(`${BASE}/codigos-turno`).then((r) => r.data);

export const createCodigoTurno = (data: {
  codigo: string;
  nombre: string;
  color?: string;
  activo?: boolean;
  esDescanso?: boolean;
}): Promise<CPCodigoTurno> => api.post(`${BASE}/codigos-turno`, data).then((r) => r.data);

export const updateCodigoTurno = (
  id: number,
  data: Partial<{
    codigo: string;
    nombre: string;
    color: string;
    activo: boolean;
    esDescanso: boolean;
  }>,
): Promise<CPCodigoTurno> => api.patch(`${BASE}/codigos-turno/${id}`, data).then((r) => r.data);

export const deleteCodigoTurno = (id: number) => api.delete(`${BASE}/codigos-turno/${id}`);

// ==================== HORARIOS MENSUALES ====================

export const getHorariosByContrato = (contratoId: number): Promise<CPHorarioMensual[]> =>
  api.get(`${BASE}/horarios`, { params: { contratoId } }).then((r) => r.data);

export const getHorario = (id: number): Promise<CPHorarioMensual> =>
  api.get(`${BASE}/horarios/${id}`).then((r) => r.data);

export const createHorario = (data: {
  contratoId: number;
  fechaInicio: string;
  fechaFin: string;
}): Promise<CPHorarioMensual> => api.post(`${BASE}/horarios`, data).then((r) => r.data);

export const deleteHorario = (id: number) => api.delete(`${BASE}/horarios/${id}`);

export const upsertCeldaHorario = (
  id: number,
  data: { puestoId: number; cedula: string; nombreGuardia: string; fecha: string; codigoTurno: string },
): Promise<CPHorarioCelda> => api.post(`${BASE}/horarios/${id}/celdas`, data).then((r) => r.data);

export const reemplazarCeldasPuestoHorario = (
  id: number,
  data: {
    puestoId: number;
    celdas: { cedula: string; nombreGuardia: string; fecha: string; codigoTurno: string }[];
  },
): Promise<CPHorarioCelda[]> =>
  api.post(`${BASE}/horarios/${id}/celdas/reemplazar-puesto`, data).then((r) => r.data);

export const intercambiarTurnoHorario = (
  id: number,
  data: { puestoId: number; fecha: string; cedulaA: string; cedulaB: string },
): Promise<CPHorarioCelda[]> => api.post(`${BASE}/horarios/${id}/intercambiar-turno`, data).then((r) => r.data);

export const generarPatronHorario = (
  horarioId: number,
  data: {
    puestoId: number;
    patron: PatronRotacionConfig;
    guardarComoPatronDelPuesto?: boolean;
  },
): Promise<CPHorarioCelda[]> =>
  api.post(`${BASE}/horarios/${horarioId}/generar-patron`, data).then((r) => r.data);

export const cambiarEstadoHorario = (
  id: number,
  data: { estado: string; motivoRechazo?: string },
): Promise<CPHorarioMensual> => api.patch(`${BASE}/horarios/${id}/estado`, data).then((r) => r.data);

export const getHorarioPdfBlob = (id: number): Promise<Blob> =>
  api.get(`${BASE}/horarios/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

export const getHorarioExcelBlob = (id: number): Promise<Blob> =>
  api.get(`${BASE}/horarios/${id}/excel`, { responseType: 'blob' }).then((r) => r.data);

// ==================== INFORMES MENSUALES ====================

export const getPlantillaInforme = (): Promise<CPPlantillaInforme | null> =>
  api.get(`${BASE}/informes/plantilla`).then((r) => r.data);

export const upsertPlantillaInforme = (data: { driveUrl?: string }): Promise<CPPlantillaInforme> =>
  api.post(`${BASE}/informes/plantilla`, data).then((r) => r.data);

export const getInformesByContrato = (contratoId: number): Promise<CPInformeMensual[]> =>
  api.get(`${BASE}/informes`, { params: { contratoId } }).then((r) => r.data);

export const getInforme = (id: number): Promise<CPInformeMensual> =>
  api.get(`${BASE}/informes/${id}`).then((r) => r.data);

export const getDatosAutogeneradosInforme = (id: number): Promise<CPDatosAutogeneradosInforme> =>
  api.get(`${BASE}/informes/${id}/datos-autogenerados`).then((r) => r.data);

export const createInforme = (data: {
  contratoId: number;
  anio: number;
  mes: number;
  horarioMensualId?: number;
}): Promise<CPInformeMensual> => api.post(`${BASE}/informes`, data).then((r) => r.data);

export const updateInforme = (
  id: number,
  data: Partial<{ retroalimentacion: string; conclusiones: string }>,
): Promise<CPInformeMensual> => api.patch(`${BASE}/informes/${id}`, data).then((r) => r.data);

export const deleteInforme = (id: number) => api.delete(`${BASE}/informes/${id}`);

export const generarPdfInforme = (id: number): Promise<{ success: boolean; pdfUrl: string }> =>
  api.post(`${BASE}/informes/${id}/generar-pdf`).then((r) => r.data);

export const resolveInformeFileUrl = (filePath: string): string =>
  `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '')}${filePath}`;

// ==================== TEXTOS INSTITUCIONALES ====================

export const getTextosInstitucionales = (): Promise<CPTextoInstitucional[]> =>
  api.get(`${BASE}/textos-institucionales`).then((r) => r.data);

export const upsertTextoInstitucional = (data: {
  clave: string;
  contenido: string;
}): Promise<CPTextoInstitucional> => api.post(`${BASE}/textos-institucionales`, data).then((r) => r.data);

export const deleteTextoInstitucional = (clave: string) =>
  api.delete(`${BASE}/textos-institucionales/${clave}`);

// ==================== ENTREGAS DE DOCUMENTOS (otras áreas) ====================

const ENTREGAS = `${BASE}/entregas`;

export const getCarpetaEntregas = (): Promise<CPCarpetaEntregas | null> =>
  api.get(`${ENTREGAS}/carpeta`).then((r) => r.data || null);

export const saveCarpetaEntregas = (driveFolderId: string): Promise<CPCarpetaEntregas> =>
  api.put(`${ENTREGAS}/carpeta`, { driveFolderId }).then((r) => r.data);

export const getSolicitudesDeEntidad = (entidadId: number): Promise<CPSolicitudesDeEntidad> =>
  api.get(`${ENTREGAS}/entidades/${entidadId}/solicitudes`).then((r) => r.data);

export const createSolicitud = (
  entidadId: number,
  data: { anio: number; mes: number; copiarMesAnterior: boolean },
): Promise<CPSolicitudMensual> =>
  api.post(`${ENTREGAS}/entidades/${entidadId}/solicitudes`, data).then((r) => r.data);

export const getSolicitud = (id: number): Promise<CPSolicitudMensual> =>
  api.get(`${ENTREGAS}/solicitudes/${id}`).then((r) => r.data);

export const deleteSolicitud = (id: number) => api.delete(`${ENTREGAS}/solicitudes/${id}`);

export const enviarSolicitud = (id: number): Promise<CPSolicitudMensual> =>
  api.post(`${ENTREGAS}/solicitudes/${id}/enviar`).then((r) => r.data);

export interface EntregaPayload {
  nombre: string;
  descripcion?: string;
  departmentId?: number | null;
  fechaLimite: string;
  responsableIds: number[];
}

export const addDocumentoSolicitud = (
  solicitudId: number,
  data: EntregaPayload,
): Promise<CPSolicitudMensual> =>
  api.post(`${ENTREGAS}/solicitudes/${solicitudId}/documentos`, data).then((r) => r.data);

export const updateDocumentoSolicitud = (
  id: number,
  data: Partial<EntregaPayload>,
): Promise<CPSolicitudMensual> => api.patch(`${ENTREGAS}/documentos/${id}`, data).then((r) => r.data);

export const deleteDocumentoSolicitud = (id: number): Promise<CPSolicitudMensual> =>
  api.delete(`${ENTREGAS}/documentos/${id}`).then((r) => r.data);

export const subirArchivoEntrega = (id: number, file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post(`${ENTREGAS}/documentos/${id}/archivo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const entregarDocumento = (
  id: number,
  data: {
    origen: 'ARCHIVO' | 'ENLACE';
    url: string;
    /** Solo si ya había un archivo en Drive: true lo borra, false lo conserva junto al nuevo. */
    reemplazarAnterior?: boolean;
  },
): Promise<CPSolicitudMensual> => api.post(`${ENTREGAS}/documentos/${id}/entregar`, data).then((r) => r.data);

/** Vuelve a avisar (campana y correo) a los responsables de un documento pendiente o rechazado. */
export const recordarDocumento = (id: number): Promise<{ avisados: number }> =>
  api.post(`${ENTREGAS}/documentos/${id}/recordar`).then((r) => r.data);

export const aprobarDocumento =(id: number): Promise<CPSolicitudMensual> =>
  api.post(`${ENTREGAS}/documentos/${id}/aprobar`).then((r) => r.data);

export const rechazarDocumento = (id: number, motivo: string): Promise<CPSolicitudMensual> =>
  api.post(`${ENTREGAS}/documentos/${id}/rechazar`, { motivo }).then((r) => r.data);

// ---- revisión: historial, vista previa y bandejas ----

export const getHistorialEntrega = (documentoId: number): Promise<CPHistorialEntrega[]> =>
  api.get(`${ENTREGAS}/documentos/${documentoId}/historial`).then((r) => r.data);

/** El archivo entregado (pasa por el servidor con la sesión de quien lo pide). */
export const fetchArchivoEntrega = (documentoId: number, original = false, comoPdf = false): Promise<Blob> =>
  api
    .get(`${ENTREGAS}/documentos/${documentoId}/archivo`, {
      responseType: 'blob',
      // Word llega convertido a PDF y un Excel (.xlsx) como JSON con sus hojas (ExcelViewer);
      // `descargar` trae el original y `formato=pdf` fuerza el PDF también para Excel.
      params: original ? { descargar: 1 } : comoPdf ? { formato: 'pdf' } : undefined,
    })
    .then((r) => r.data);

/** Lo que le asignaron a quien entrega, de todas las entidades. */
export const getMisDocumentos = (): Promise<CPDocumentoBandeja[]> =>
  api.get(`${ENTREGAS}/mis-documentos`).then((r) => r.data);

/** Lo entregado y sin revisar, de todas las entidades (solo personal de Contratación Pública). */
export const getPorRevisar = (): Promise<CPDocumentoBandeja[]> =>
  api.get(`${ENTREGAS}/por-revisar`).then((r) => r.data);
