/**
 * Reglas fijas del cronograma de supervisión: qué días se planea visitar cada punto, qué visitas se
 * hicieron y qué quedó sin visita. Todo es código: nada lo decide el modelo. Las funciones son puras
 * (sin base de datos) para poder probarlas solas.
 */

const MS_DIA = 86_400_000;
const aMs = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const JORNADAS = ['DIURNA', 'NOCTURNA', 'DIURNA/NOCTURNA'] as const;
export const JORNADA_POR_DEFECTO = 'DIURNA/NOCTURNA';
/** Cuántos días atrás se puede registrar una visita (un supervisor puede anotarla al día siguiente). */
export const DIAS_ATRAS_VISITA = 3;
/** Un cronograma cubre como máximo este número de días (un ciclo mensual y holgura). */
export const MAX_DIAS_CRONOGRAMA = 62;

export type ModoRelleno = 'TODOS' | 'LUN_VIE' | 'FIN_SEMANA' | 'NINGUNO';

/** Todas las fechas entre dos días, ambos incluidos. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let t = aMs(desde); t <= aMs(hasta); t += MS_DIA) out.push(aIso(t));
  return out;
}

/** 0 = domingo … 6 = sábado. */
export const diaDeSemana = (iso: string): number => new Date(aMs(iso)).getUTCDay();

/** Los días del rango que entran en el modo elegido (para el relleno rápido). */
export function diasSegunModo(modo: ModoRelleno, desde: string, hasta: string): string[] {
  const todos = diasDelRango(desde, hasta);
  if (modo === 'NINGUNO') return [];
  if (modo === 'LUN_VIE') return todos.filter((f) => diaDeSemana(f) >= 1 && diaDeSemana(f) <= 5);
  if (modo === 'FIN_SEMANA') return todos.filter((f) => diaDeSemana(f) === 0 || diaDeSemana(f) === 6);
  return todos;
}

export type EstadoDia = 'CUMPLIDA' | 'PENDIENTE' | 'SIN_VISITA' | 'EXTRA' | null;

/**
 * Estado de un día de un punto:
 * - CUMPLIDA: estaba planeada y hubo visita.
 * - PENDIENTE: estaba planeada y todavía no pasa (hoy o futuro) sin visita.
 * - SIN_VISITA: estaba planeada, ya pasó y no hubo visita.
 * - EXTRA: hubo visita en un día que no estaba planeado.
 */
export function estadoDelDia(o: { planificado: boolean; visitas: number; fecha: string; hoy: string }): EstadoDia {
  if (o.planificado) {
    if (o.visitas > 0) return 'CUMPLIDA';
    return o.fecha < o.hoy ? 'SIN_VISITA' : 'PENDIENTE';
  }
  return o.visitas > 0 ? 'EXTRA' : null;
}

export interface ResumenCumplimiento {
  planificadas: number;
  cumplidas: number;
  sinVisita: number;
  pendientes: number;
  extras: number;
  /** % de las planeadas que ya pasaron y se cumplieron; null si todavía no pasó ninguna. */
  cumplimiento: number | null;
}

export function resumirCumplimiento(estados: EstadoDia[]): ResumenCumplimiento {
  const cuenta = (e: EstadoDia) => estados.filter((x) => x === e).length;
  const cumplidas = cuenta('CUMPLIDA');
  const sinVisita = cuenta('SIN_VISITA');
  const base = cumplidas + sinVisita;
  return {
    planificadas: cumplidas + sinVisita + cuenta('PENDIENTE'),
    cumplidas,
    sinVisita,
    pendientes: cuenta('PENDIENTE'),
    extras: cuenta('EXTRA'),
    cumplimiento: base === 0 ? null : Math.round((cumplidas / base) * 100),
  };
}

/** Por qué una visita no se puede registrar con esa fecha, o null si vale. */
export function fechaDeVisitaNoPermitida(fecha: string, hoy: string): string | null {
  if (fecha > hoy) return 'No se puede registrar la visita de un día que todavía no llega.';
  if ((aMs(hoy) - aMs(fecha)) / MS_DIA > DIAS_ATRAS_VISITA) {
    return `Solo se registran visitas de hoy o de los últimos ${DIAS_ATRAS_VISITA} días.`;
  }
  return null;
}

/** Cuántos días de la ventana (los `n` anteriores a hoy) tuvo un punto planeados y sin visita. */
export function diasSinVisita(o: {
  planeados: string[];
  conVisita: Set<string>;
  hoy: string;
  n: number;
}): string[] {
  const desde = aIso(aMs(o.hoy) - o.n * MS_DIA);
  return o.planeados.filter((f) => f >= desde && f < o.hoy && !o.conVisita.has(f)).sort();
}

/** Hora «HH:mm» válida, o null. */
export const horaValida = (h: unknown): h is string => typeof h === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(h);
