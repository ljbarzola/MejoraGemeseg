import { api } from './auth.service';

export type EstadoPropuesta =
  | 'PENDIENTE'
  | 'PLAN_APROBADO'
  | 'CAMBIOS_PEDIDOS'
  | 'RECHAZADA'
  | 'MAS_TARDE'
  | 'EN_CURSO'
  | 'HECHA';

export type TipoPropuesta = 'AUTOMATIZAR_ACTUAL' | 'IDEA_NUEVA';

export interface EventoHistorial {
  en: string;
  por: string;
  accion: string;
  motivo?: string;
  comentario?: string;
}

export interface Propuesta {
  id: number;
  semana: string;
  tipo: TipoPropuesta;
  titulo: string;
  queSeAutomatiza: string | null;
  decisionHumana: string | null;
  plan: string[];
  impacto: string | null;
  esfuerzo: string | null;
  riesgo: string | null;
  lineaBlanca: boolean;
  evidencia: string | null;
  dependeDe: string | null;
  porQueAhora: string | null;
  comoProbarBarato: string | null;
  horasAhorradasMes: number | null;
  estado: EstadoPropuesta;
  motivo: string | null;
  comentarioCambios: string | null;
  revision: number;
  historial: EventoHistorial[];
  decididoPorNombre: string | null;
  decididoEn: string | null;
  hechaEn: string | null;
  createdAt: string;
}

export interface InformeSemanal {
  id: number;
  semana: string;
  tipo: 'LUNES' | 'VIERNES';
  createdAt: string;
  contenido: {
    alertasRiesgo?: string[];
    aprendizaje?: string | null;
    mdDesactualizados?: string[];
    mejorado?: string[];
    falto?: string[];
    rechazado?: string[];
    focoSugerido?: string | null;
    horasAhorradasEstimadas?: number | null;
    modelosUsados?: Record<string, string>;
  };
}

export interface PanelMejoraContinua {
  semanaActual: string;
  propuestas: Propuesta[];
  informes: InformeSemanal[];
  resumen: {
    porEstado: Record<EstadoPropuesta, number>;
    horasAhorradasMes: number;
    cupo: { limite: number; ocupados: number };
  };
}

export interface TarjetaMejoraContinua {
  pendientes: number;
  enCurso: number;
  hechas: number;
  horasAhorradasMes: number;
  semanaActual: string;
}

export type AccionDecision = 'APROBAR' | 'PEDIR_CAMBIOS' | 'RECHAZAR' | 'MAS_TARDE';

export const getPanelMejoraContinua = (): Promise<PanelMejoraContinua> =>
  api.get('/admin/mejora-continua').then((r) => r.data);

export const getTarjetaMejoraContinua = (): Promise<TarjetaMejoraContinua> =>
  api.get('/admin/mejora-continua/tarjeta').then((r) => r.data);

export const decidirPropuesta = (
  id: number,
  accion: AccionDecision,
  datos: { motivo?: string; comentario?: string } = {},
): Promise<Propuesta> =>
  api.post(`/admin/mejora-continua/${id}/decision`, { accion, ...datos }).then((r) => r.data);

export const cambiarProgresoPropuesta = (
  id: number,
  estado: 'EN_CURSO' | 'HECHA',
  horasAhorradasMes?: number,
): Promise<Propuesta> =>
  api.post(`/admin/mejora-continua/${id}/progreso`, { estado, horasAhorradasMes }).then((r) => r.data);

export const getBriefPropuesta = (id: number): Promise<{ id: number; titulo: string; brief: string }> =>
  api.get(`/admin/mejora-continua/${id}/brief`).then((r) => r.data);
