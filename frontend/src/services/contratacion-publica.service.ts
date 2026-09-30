import { api } from './auth.service';
import type {
  CPEntidadPublica,
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
} from '../types/contratacion-publica';

const BASE = '/contratacion-publica';

// ==================== ENTIDADES PÚBLICAS ====================

export const getEntidadesPublicas = (): Promise<CPEntidadPublica[]> =>
  api.get(`${BASE}/entidades`).then((r) => r.data);

export const getEntidadPublica = (id: number): Promise<CPEntidadPublica> =>
  api.get(`${BASE}/entidades/${id}`).then((r) => r.data);

export const createEntidadPublica = (data: {
  nombre: string;
  ruc?: string;
  direccion?: string;
}): Promise<CPEntidadPublica> => api.post(`${BASE}/entidades`, data).then((r) => r.data);

export const updateEntidadPublica = (
  id: number,
  data: Partial<{ nombre: string; ruc: string; direccion: string }>,
): Promise<CPEntidadPublica> => api.patch(`${BASE}/entidades/${id}`, data).then((r) => r.data);

export const deleteEntidadPublica = (id: number) => api.delete(`${BASE}/entidades/${id}`);

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
