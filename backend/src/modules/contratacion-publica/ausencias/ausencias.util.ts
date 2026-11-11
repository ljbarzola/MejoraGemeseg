// Reglas fijas de las faltas registradas al momento («No llegó»). Todo es código: nada lo decide el modelo.

import type { CeldaHorario } from '../bitacoras/bitacora-revisor.util';

export const DIAS_ATRAS_PERMITIDOS = 7;
export const MOTIVO_LABEL: Record<string, string> = {
  NO_AVISO: 'no avisó',
  ENFERMEDAD: 'enfermedad',
  PERMISO: 'permiso',
  OTRO: 'otro motivo',
};

const MS_DIA = 86_400_000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const aMs = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};

/** '2026-11-06' → '6 de noviembre'. */
export function diaLegible(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** Una falta se registra hoy o hasta 7 días atrás; nunca de un día futuro. Devuelve el motivo si no vale. */
export function fechaNoPermitida(fecha: string, hoy: string): string | null {
  if (fecha > hoy) return 'No se puede registrar la falta de un día que todavía no llega.';
  if ((aMs(hoy) - aMs(fecha)) / MS_DIA > DIAS_ATRAS_PERMITIDOS)
    return `Solo se registran faltas de hoy o de los últimos ${DIAS_ATRAS_PERMITIDOS} días. Para días anteriores sube la bitácora.`;
  return null;
}

export interface EntradaConflictoReemplazo {
  reemplazoCedula: string;
  ausenteCedula: string;
  /** Quienes tienen un turno de trabajo ese día en el contrato. */
  trabajando: Set<string>;
  /** Quienes tienen una falta registrada (activa) ese día. */
  ausentes: Set<string>;
  /** Quienes ya cubren otra falta ese día. */
  cubriendo: Set<string>;
}

/** Por qué una persona no puede ser el reemplazo, o null si puede. */
export function conflictoReemplazo(e: EntradaConflictoReemplazo): string | null {
  if (e.reemplazoCedula === e.ausenteCedula) return 'Quien cubre no puede ser quien faltó.';
  if (e.trabajando.has(e.reemplazoCedula)) return 'Ese guardia ya tiene un turno de trabajo ese día en este contrato.';
  if (e.ausentes.has(e.reemplazoCedula)) return 'Ese guardia también tiene una falta registrada ese día.';
  if (e.cubriendo.has(e.reemplazoCedula)) return 'Ese guardia ya está cubriendo otra falta ese día.';
  return null;
}

export interface AusenciaParaRevision {
  fecha: string;
  cedula: string;
  /** POR_CUBRIR | CUBIERTA (las anuladas no se pasan). */
  estado: string;
  reemplazoCedula: string | null;
  reemplazoNombre: string | null;
}

/**
 * El horario que debe esperar la revisión de una bitácora cuando ya se registró que alguien no llegó:
 * con reemplazo, su turno pasa a quien cubrió; sin reemplazo, nadie lo ocupa. Así la hoja que sale
 * «como pasó» no se marca como error por lo que ya se avisó al momento.
 */
export function aplicarAusencias(celdas: CeldaHorario[], ausencias: AusenciaParaRevision[]): CeldaHorario[] {
  if (ausencias.length === 0) return celdas;
  // Quien cubre ese día ya trabaja: su celda de descanso (o sin turno) no cuenta como esperada.
  const cubriendo = new Set(
    ausencias.filter((a) => a.estado === 'CUBIERTA' && a.reemplazoCedula).map((a) => `${a.fecha}|${a.reemplazoCedula}`),
  );
  const resultado: CeldaHorario[] = [];
  for (const c of celdas) {
    const a = ausencias.find((x) => x.fecha === c.fecha && x.cedula === c.cedula);
    if (!a) {
      if (!cubriendo.has(`${c.fecha}|${c.cedula}`)) resultado.push(c);
    }
    else if (a.estado === 'CUBIERTA' && a.reemplazoCedula && a.reemplazoNombre)
      resultado.push({ ...c, cedula: a.reemplazoCedula, nombre: a.reemplazoNombre });
    // POR_CUBRIR: la celda se quita, nadie ocupa ese turno.
  }
  return resultado;
}
