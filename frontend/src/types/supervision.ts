// Cronograma de supervisión y registro de visitas (Operaciones, 2026-11-10).

export type EstadoDiaSupervision = 'CUMPLIDA' | 'PENDIENTE' | 'SIN_VISITA' | 'EXTRA' | null;
export type GuardiaPresente = 'SI' | 'NO' | 'NO_APLICA';
export type ModoRelleno = 'TODOS' | 'LUN_VIE' | 'FIN_SEMANA' | 'NINGUNO';

export const JORNADAS_SUPERVISION = ['DIURNA', 'NOCTURNA', 'DIURNA/NOCTURNA'] as const;

export interface ResumenCumplimiento {
  planificadas: number;
  cumplidas: number;
  sinVisita: number;
  pendientes: number;
  extras: number;
  /** % de las planeadas que ya pasaron y se cumplieron; null si todavía no pasó ninguna. */
  cumplimiento: number | null;
}

export interface PuntoCronograma {
  id: number;
  puestoId: number;
  puestoNombre: string;
  supervisorUserId: number | null;
  supervisorNombre: string | null;
  jornada: string;
  planificados: string[];
  visitasPorDia: Record<string, number>;
  estados: Record<string, EstadoDiaSupervision>;
  resumen: ResumenCumplimiento;
}

export interface Cronograma {
  id: number;
  contratoId: number;
  contratoNumero: string;
  entidadNombre: string;
  administradorNombre: string | null;
  administradorCargo: string | null;
  fechaInicio: string;
  fechaFin: string;
  hoy: string;
  dias: string[];
  puntos: PuntoCronograma[];
  resumen: ResumenCumplimiento;
}

export interface CronogramaResumen {
  id: number;
  contratoId: number;
  contratoNumero: string;
  entidadNombre: string;
  fechaInicio: string;
  fechaFin: string;
  puntos: number;
  sinSupervisor: number;
}

export interface CandidatoSupervisor {
  id: number;
  nombre: string;
}

export interface VisitaSupervision {
  id: number;
  contratoId: number;
  puestoId: number;
  puestoNombre: string;
  fecha: string;
  hora: string;
  supervisorUserId: number;
  supervisorNombre: string;
  guardiaPresente: GuardiaPresente;
  observacion: string | null;
  conFoto: boolean;
  createdAt: string;
}

export interface MiPuntoHoy {
  puntoId: number;
  cronogramaId: number;
  puestoId: number;
  puestoNombre: string;
  contratoId: number;
  contratoNumero: string;
  entidadNombre: string;
  jornada: string;
  planificadaHoy: boolean;
  visitasHoy: { id: number; hora: string; guardiaPresente: GuardiaPresente; supervisorNombre: string }[];
  /** Días planeados de los últimos 3 sin visita: todavía se pueden registrar. */
  diasSinVisita: string[];
}

export interface MisVisitasHoy {
  fecha: string;
  puntos: MiPuntoHoy[];
}

export interface SinVisita {
  fecha: string;
  ventanaDias: number;
  puntos: {
    cronogramaId: number;
    contratoNumero: string;
    entidadNombre: string;
    puestoId: number;
    puestoNombre: string;
    supervisorNombre: string | null;
    dias: string[];
  }[];
}
