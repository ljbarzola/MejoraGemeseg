import { dentroDelHorario, Horario } from './bitacora-extension.util';

export type { VentanaExtra } from './bitacora-extension.util';

/**
 * Lógica pura del «tiempo extra» y la bolsa de horas (2026-11-10). Sin base de
 * datos, para poder probarla sola.
 *
 * Idea: la persona pulsa «Empezar tiempo extra» al llegar antes o al quedarse
 * después del horario. Mientras la ventana está abierta, la extensión registra
 * aunque sea fuera del horario. Cuando se cierra, el tiempo extra son los MINUTOS
 * CON ACTIVIDAD REAL (sitios web, acciones en la app, Drive) que cayeron FUERA del
 * horario dentro de la ventana; lo que se escribe a mano no entra en la cuenta.
 */

const MIN = 60_000;

export const TOLERANCIA_DEFECTO = 10;
export const TOLERANCIA_MAXIMA = 60;
/** Mínimo 10: la extensión envía cada 5 minutos, y un valor menor cerraría ventanas por un simple retraso. */
export const INACTIVIDAD_DEFECTO = 15;
export const INACTIVIDAD_MINIMA = 10;
export const INACTIVIDAD_MAXIMA = 120;
/** Una ventana de tiempo extra nunca dura más que esto (por si alguien se olvida de cerrarla). */
export const EXTRA_MAXIMO_MINUTOS = 8 * 60;
/** Lo máximo que se puede anotar de una sola vez como «horas que debo». */
export const DEUDA_MAXIMA_MINUTOS = 24 * 60;

export interface ReglasExtra {
  /** Menos de estos minutos de tiempo extra no suman. */
  toleranciaMinutos: number;
  /** Minutos sin actividad tras los que la ventana se cierra sola. */
  inactividadMinutos: number;
}

export const REGLAS_POR_DEFECTO: ReglasExtra = {
  toleranciaMinutos: TOLERANCIA_DEFECTO,
  inactividadMinutos: INACTIVIDAD_DEFECTO,
};

export type MotivoCierre = 'MANUAL' | 'INACTIVIDAD' | 'HORARIO' | 'LIMITE';

export interface EventoDeActividad {
  ocurridoEn: Date;
  fuente: string;
  minutos: number | null;
}

/** Valida lo que llega del formulario de reglas. Devuelve el mensaje de error, o null si está bien. */
export function errorDeReglas(r: Partial<ReglasExtra>): string | null {
  const { toleranciaMinutos: t, inactividadMinutos: i } = r;
  if (
    t !== undefined &&
    (!Number.isInteger(t) || t < 0 || t > TOLERANCIA_MAXIMA)
  ) {
    return `La tolerancia debe estar entre 0 y ${TOLERANCIA_MAXIMA} minutos.`;
  }
  if (
    i !== undefined &&
    (!Number.isInteger(i) || i < INACTIVIDAD_MINIMA || i > INACTIVIDAD_MAXIMA)
  ) {
    return `La inactividad debe estar entre ${INACTIVIDAD_MINIMA} y ${INACTIVIDAD_MAXIMA} minutos.`;
  }
  return null;
}

const minutoDe = (d: Date): number => Math.floor(d.getTime() / MIN);

/**
 * Minutos (numerados desde 1970, uno por cada minuto) en los que hubo actividad.
 * Un tramo del navegador cubre todos los minutos que duró; una acción en la app
 * o en Google cubre el minuto en que ocurrió.
 */
export function minutosActivos(eventos: EventoDeActividad[]): Set<number> {
  const activos = new Set<number>();
  for (const e of eventos) {
    const inicio = minutoDe(e.ocurridoEn);
    const duracion =
      e.fuente === 'EXTENSION' ? Math.max(1, e.minutos ?? 1) : 1;
    for (let i = 0; i < duracion; i++) activos.add(inicio + i);
  }
  return activos;
}

/**
 * ¿La ventana ya debería haberse cerrado sola? Camina minuto a minuto desde el
 * inicio hasta ahora y devuelve el primer motivo que se cumple, con el instante en
 * que terminó de verdad la ventana:
 *  - HORARIO: la persona llegó antes y ya empezó el horario normal (termina ahí).
 *  - INACTIVIDAD: pasaron `inactividadMinutos` sin actividad (termina al acabar la última).
 *  - LIMITE: llegó al tope de duración.
 * Devuelve null si sigue vigente.
 */
export function cierreAutomatico(args: {
  inicio: Date;
  ahora: Date;
  activos: Set<number>;
  horario: Horario | null;
  inactividadMinutos: number;
  maximoMinutos?: number;
}): { fin: Date; motivo: MotivoCierre } | null {
  const {
    inicio,
    ahora,
    activos,
    horario,
    inactividadMinutos,
    maximoMinutos = EXTRA_MAXIMO_MINUTOS,
  } = args;
  const desde = minutoDe(inicio);
  const hasta = minutoDe(ahora);
  let ultimaActividad = desde;
  let estuvoFuera = false;

  for (let m = desde; m <= hasta; m++) {
    const dentro = horario ? dentroDelHorario(horario, new Date(m * MIN)) : false;
    if (!dentro) estuvoFuera = true;
    else if (estuvoFuera) {
      return { fin: new Date(m * MIN), motivo: 'HORARIO' };
    }
    if (activos.has(m)) ultimaActividad = m;
    if (m - ultimaActividad >= inactividadMinutos) {
      return {
        fin: new Date((ultimaActividad + 1) * MIN),
        motivo: 'INACTIVIDAD',
      };
    }
    if (m - desde >= maximoMinutos) {
      return { fin: new Date((desde + maximoMinutos) * MIN), motivo: 'LIMITE' };
    }
  }
  return null;
}

/**
 * Minutos de tiempo extra de una ventana: los minutos con actividad que cayeron
 * dentro de [inicio, fin) y FUERA del horario (lo que cae dentro del horario es
 * jornada normal, no extra).
 */
export function minutosDeExtra(args: {
  inicio: Date;
  fin: Date;
  activos: Set<number>;
  horario: Horario | null;
}): number {
  const { inicio, fin, activos, horario } = args;
  const desde = minutoDe(inicio);
  const hasta = minutoDe(fin);
  let total = 0;
  for (let m = desde; m < hasta; m++) {
    if (!activos.has(m)) continue;
    if (horario && dentroDelHorario(horario, new Date(m * MIN))) continue;
    total++;
  }
  return total;
}

/** Lo que cuenta de verdad: por debajo de la tolerancia no suma nada. */
export function minutosContados(minutos: number, tolerancia: number): number {
  return minutos < tolerancia || minutos <= 0 ? 0 : minutos;
}

export interface ItemSaldo {
  estado: string;
  minutosContados: number | null;
}

export interface Saldo {
  /** Tiempo extra aprobado. */
  abonadoMinutos: number;
  /** Horas debidas (sin las anuladas). */
  deudaMinutos: number;
  /** abonado − deuda: positivo = a favor de la persona; negativo = debe horas. */
  saldoMinutos: number;
  /** Tiempo extra que espera aprobación (aún no suma). */
  pendienteMinutos: number;
}

export function calcularSaldo(
  extras: ItemSaldo[],
  deudas: { minutos: number }[],
): Saldo {
  const suma = (estado: string) =>
    extras
      .filter((e) => e.estado === estado)
      .reduce((s, e) => s + (e.minutosContados ?? 0), 0);
  const abonadoMinutos = suma('APROBADA');
  const deudaMinutos = deudas.reduce((s, d) => s + d.minutos, 0);
  return {
    abonadoMinutos,
    deudaMinutos,
    saldoMinutos: abonadoMinutos - deudaMinutos,
    pendienteMinutos: suma('PENDIENTE'),
  };
}
