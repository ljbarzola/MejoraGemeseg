import { hoyEcuador, minutosDelDia, sumarDias } from './bitacora-fecha.util';
import { moduloEtiqueta } from './bitacora-etiquetas.util';

/** Períodos que ofrece el Dashboard, en días terminando hoy. */
export const PERIODOS_METRICAS = [7, 14, 30] as const;
export const PERIODO_METRICAS_POR_DEFECTO = 7;
const MAX_MODULOS = 8;

export interface EventoMetrica {
  userId: number;
  fuente: string;
  modulo: string;
  ocurridoEn: Date;
}

export interface DiaMetrica {
  fecha: string;
  personasConActividad: number;
  eventosApp: number;
  eventosGoogle: number;
  /** Tramos de sitios web que reportó la extensión del navegador. */
  eventosWeb: number;
}

export interface ModuloMetrica {
  modulo: string;
  etiqueta: string;
  eventos: number;
}

export interface Metricas {
  dias: number;
  desde: string;
  hasta: string;
  /** Personas a las que HOY se les registra la hoja. */
  personasActivas: number;
  resumen: {
    eventos: number;
    /** Promedio diario de personas con al menos un evento (un decimal). */
    promedioPersonasConActividad: number;
    /** Hora media de la primera y de la última actividad del día, «HH:MM», sobre los días-persona con actividad. */
    horaMediaInicio: string | null;
    horaMediaFin: string | null;
    diasConActividad: number;
  };
  porDia: DiaMetrica[];
  /** Eventos por hora del día de Ecuador (24 valores, de 0 a 23). */
  porHora: number[];
  porModulo: ModuloMetrica[];
}

/** El período pedido, o el de siempre si no es uno de los permitidos. */
export function resolverPeriodo(valor: unknown): number {
  const n = Number(valor);
  return (PERIODOS_METRICAS as readonly number[]).includes(n)
    ? n
    : PERIODO_METRICAS_POR_DEFECTO;
}

/** Primer día del período (el último es `hoy`). */
export function desdeDelPeriodo(
  dias: number,
  hoy: string = hoyEcuador(),
): string {
  return sumarDias(hoy, -(dias - 1));
}

function dia(instante: Date): string {
  return new Date(instante.getTime() - 5 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function hhmm(minutos: number): string {
  const m = Math.round(minutos);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Métricas del equipo en un período, a partir de los eventos ya registrados.
 * Son cifras del equipo, no un ranking de personas: solo cuenta lo que quedó
 * registrado, así que quien trabaja fuera de app.gemeseg y Google pesa poco.
 */
export function calcularMetricas(
  eventos: EventoMetrica[],
  desde: string,
  dias: number,
  personasActivas: number,
): Metricas {
  const porDia = new Map<string, DiaMetrica>();
  const personasPorDia = new Map<string, Set<number>>();
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desde, i);
    porDia.set(fecha, {
      fecha,
      personasConActividad: 0,
      eventosApp: 0,
      eventosGoogle: 0,
      eventosWeb: 0,
    });
    personasPorDia.set(fecha, new Set());
  }

  const porHora = new Array<number>(24).fill(0);
  const modulos = new Map<string, number>();
  // Primera y última actividad de cada persona en cada día, en minutos desde las 00:00.
  const extremos = new Map<string, { primero: number; ultimo: number }>();

  for (const e of eventos) {
    const fecha = dia(e.ocurridoEn);
    const celda = porDia.get(fecha);
    if (!celda) continue; // fuera del período
    if (e.fuente === 'GOOGLE') celda.eventosGoogle++;
    else if (e.fuente === 'EXTENSION') celda.eventosWeb++;
    else celda.eventosApp++;
    personasPorDia.get(fecha)?.add(e.userId);

    const minutos = minutosDelDia(e.ocurridoEn);
    porHora[Math.floor(minutos / 60)]++;
    modulos.set(e.modulo, (modulos.get(e.modulo) ?? 0) + 1);

    const clave = `${fecha}|${e.userId}`;
    const previo = extremos.get(clave);
    if (!previo) extremos.set(clave, { primero: minutos, ultimo: minutos });
    else {
      previo.primero = Math.min(previo.primero, minutos);
      previo.ultimo = Math.max(previo.ultimo, minutos);
    }
  }

  const lista = [...porDia.values()].map((d) => ({
    ...d,
    personasConActividad: personasPorDia.get(d.fecha)?.size ?? 0,
  }));
  const totalEventos = lista.reduce(
    (s, d) => s + d.eventosApp + d.eventosGoogle + d.eventosWeb,
    0,
  );
  const diasConActividad = lista.filter(
    (d) => d.eventosApp + d.eventosGoogle + d.eventosWeb > 0,
  ).length;
  const sumaPersonas = lista.reduce((s, d) => s + d.personasConActividad, 0);
  const pares = [...extremos.values()];

  return {
    dias,
    desde,
    hasta: sumarDias(desde, dias - 1),
    personasActivas,
    resumen: {
      eventos: totalEventos,
      promedioPersonasConActividad: Math.round((sumaPersonas / dias) * 10) / 10,
      horaMediaInicio: pares.length
        ? hhmm(pares.reduce((s, p) => s + p.primero, 0) / pares.length)
        : null,
      horaMediaFin: pares.length
        ? hhmm(pares.reduce((s, p) => s + p.ultimo, 0) / pares.length)
        : null,
      diasConActividad,
    },
    porDia: lista,
    porHora,
    porModulo: [...modulos.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MODULOS)
      .map(([modulo, n]) => ({
        modulo,
        etiqueta: moduloEtiqueta(modulo),
        eventos: n,
      })),
  };
}
