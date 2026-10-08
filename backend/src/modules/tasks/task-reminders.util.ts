// Funciones puras de los recordatorios de tareas: sin base de datos para poder
// probarlas directo.

import {
  diasEntre,
  fechaDesdeTexto,
  textoDesdeFecha,
} from '../contratacion-publica/entregas/entregas.util';

/** Plazo máximo, en días, de un recordatorio (antes o después de la fecha fin). */
export const MAX_DIAS_RECORDATORIO = 365;

/** Si un día de ejecución se pierde, el aviso se recupera hasta un día después. */
const DIAS_DE_GRACIA = 1;

/** Recordatorios que se crean cuando la tarea tiene fecha fin y no se eligió ninguno. */
export const RECORDATORIOS_POR_DEFECTO = [1];

/**
 * Normaliza lo que llega del formulario: enteros únicos entre -365 y 365, de
 * mayor a menor. Positivo = días antes; 0 = el mismo día; negativo = días
 * después del vencimiento (-1 = el día siguiente).
 */
export function normalizarRecordatorios(dias: number[] | undefined): number[] {
  if (!dias) return [];
  return [...new Set(dias.filter((d) => Number.isInteger(d)))]
    .filter((d) => Math.abs(d) <= MAX_DIAS_RECORDATORIO)
    .sort((a, b) => b - a);
}

/**
 * La fecha fin se guarda a mediodía UTC (así no se corre de día en ningún
 * huso); para contar días se lleva a medianoche UTC, igual que `hoyEcuador()`.
 */
export function diaDeVencimiento(endDate: Date): Date {
  return fechaDesdeTexto(textoDesdeFecha(endDate));
}

/**
 * ¿Toca enviar este recordatorio hoy? Solo si todavía no se envió y la tarea
 * sigue abierta. Los avisos "antes" salen el día elegido (o un día después si
 * ese día no corrió el programador) y nunca después del vencimiento; el aviso
 * de atraso (`daysBefore` negativo) sale `-daysBefore` días después del
 * vencimiento (con la misma gracia).
 */
export function tocaEnviar(
  recordatorio: { daysBefore: number; sentAt: Date | null },
  tarea: { status: string; endDate: Date | null },
  hoy: Date,
): boolean {
  if (recordatorio.sentAt) return false;
  if (tarea.status === 'DONE' || tarea.status === 'CANCELLED') return false;
  if (!tarea.endDate) return false;

  const faltan = diasEntre(hoy, diaDeVencimiento(tarea.endDate));
  if (recordatorio.daysBefore < 0) {
    return (
      faltan <= recordatorio.daysBefore &&
      faltan >= recordatorio.daysBefore - DIAS_DE_GRACIA
    );
  }
  return (
    faltan >= 0 &&
    faltan <= recordatorio.daysBefore &&
    faltan >= recordatorio.daysBefore - DIAS_DE_GRACIA
  );
}

/** Texto corto de cuándo vence, para el correo y la campanita. */
export function cuandoVence(faltan: number, fechaTexto: string): string {
  if (faltan === 0) return 'vence HOY';
  if (faltan === 1) return `vence mañana (${fechaTexto})`;
  if (faltan > 1) return `vence en ${faltan} días (${fechaTexto})`;
  if (faltan === -1) return `venció ayer (${fechaTexto}) y sigue sin terminar`;
  return `venció hace ${-faltan} días (${fechaTexto}) y sigue sin terminar`;
}
