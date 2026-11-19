/**
 * Lo que Operaciones tiene pendiente hoy, en una forma pequeña y fija (2026-11-18).
 * Lo usan dos cosas a la vez: el resumen diario por notificación en la app y el Agente de
 * Operaciones del chat, para que nunca se contradigan. Aquí NO hay consultas a la base:
 * solo tipos y texto (la lectura vive en operaciones-pendientes.service.ts).
 */

/** Cuántos ejemplos se nombran por tema; el resto se cuenta como «y N más». */
export const MAX_EJEMPLOS = 3;
/** Para el agente de chat: cuántos ejemplos se listan cuando alguien pregunta por un tema. */
export const MAX_EJEMPLOS_AGENTE = 15;
/** Un tema se entrega con su total y unos pocos ejemplos ya redactados. */
export interface TemaPendiente {
  total: number;
  ejemplos: string[];
}

export const TEMA_VACIO: TemaPendiente = { total: 0, ejemplos: [] };

export interface PendientesOperaciones {
  /** Día de Ecuador (AAAA-MM-DD) para el que se calculó. */
  fecha: string;
  /** Faltas «No llegó» registradas en los últimos días y todavía sin cubrir. */
  faltasSinCubrir: TemaPendiente;
  /** Puestos que hoy no tienen la cobertura mínima según su horario (un puesto sin horario no cuenta). */
  puestosSinCubrir: TemaPendiente;
  /** Puestos con días de la última semana sin bitácora subida aunque el horario esperaba guardias. */
  bitacorasSinSubir: TemaPendiente;
  /** Armas con permiso vencido o por vencer. */
  permisosDeArmas: TemaPendiente;
  /** Artículos de inventario en o bajo su mínimo. */
  inventarioBajoMinimo: TemaPendiente;
  /** Puntos del cronograma de supervisión con visitas planeadas sin registrar. */
  visitasSinRegistrar: TemaPendiente;
  /** Horarios vigentes (o que empiezan pronto) que todavía no están aprobados. */
  horariosSinAprobar: TemaPendiente;
  /** Contratos activos que vencen pronto, o ya vencidos y sin cerrar. */
  contratosPorVencer: TemaPendiente;
}

/** Días hacia adelante que se mira un contrato que vence o un horario que empieza. */
export const DIAS_CONTRATO_POR_VENCER = 30;
export const DIAS_HORARIO_POR_EMPEZAR = 7;

export const TITULO_RESUMEN_OPERACIONES = 'Resumen de Operaciones';
export const ENLACE_RESUMEN_OPERACIONES = '/operaciones';

/** Recorta la lista de ejemplos y deja constancia de cuántos quedan fuera. */
export function conEjemplos(ejemplos: string[], total: number, max: number = MAX_EJEMPLOS): TemaPendiente {
  return { total, ejemplos: ejemplos.slice(0, max) };
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

function detalle(t: TemaPendiente): string {
  if (t.ejemplos.length === 0) return '';
  const resto = t.total - t.ejemplos.length;
  const cola = resto > 0 ? ` y ${resto} más` : '';
  return ` (${t.ejemplos.join('; ')}${cola})`;
}

/**
 * Un renglón por cada tema que tenga algo. Si no hay nada pendiente devuelve una lista vacía:
 * quien llama NO manda ningún aviso (nunca un resumen vacío).
 */
export function lineasDelResumen(p: PendientesOperaciones): string[] {
  const lineas: string[] = [];
  const agregar = (t: TemaPendiente, texto: (t: TemaPendiente) => string) => {
    if (t.total > 0) lineas.push(`• ${texto(t)}${detalle(t)}`);
  };
  agregar(p.faltasSinCubrir, (t) => `${plural(t.total, 'falta sin cubrir', 'faltas sin cubrir')}`);
  agregar(p.puestosSinCubrir, (t) => `${plural(t.total, 'puesto', 'puestos')} sin la cobertura mínima hoy`);
  agregar(p.bitacorasSinSubir, (t) => `${plural(t.total, 'puesto', 'puestos')} con bitácoras sin subir esta semana`);
  agregar(p.permisosDeArmas, (t) => `${plural(t.total, 'arma', 'armas')} con permiso vencido o por vencer`);
  agregar(p.inventarioBajoMinimo, (t) => `${plural(t.total, 'artículo', 'artículos')} de inventario en el mínimo o debajo`);
  agregar(p.visitasSinRegistrar, (t) => `${plural(t.total, 'punto', 'puntos')} de supervisión con visitas sin registrar`);
  agregar(p.horariosSinAprobar, (t) => `${plural(t.total, 'horario', 'horarios')} sin aprobar`);
  agregar(p.contratosPorVencer, (t) => `${plural(t.total, 'contrato', 'contratos')} por vencer o vencidos sin cerrar`);
  return lineas;
}

/** El texto de la notificación, o null si hoy no hay nada que avisar. */
export function mensajeDelResumen(p: PendientesOperaciones): string | null {
  const lineas = lineasDelResumen(p);
  if (lineas.length === 0) return null;
  return `Esto tiene pendiente Operaciones hoy:\n${lineas.join('\n')}`;
}

/** Fecha ISO (AAAA-MM-DD) → «17 nov», para los ejemplos. */
export function fechaCorta(iso: string): string {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[(m || 1) - 1]}`;
}

/**
 * Fecha de fin que de verdad manda en un contrato: una adenda NO cambia `fechaFin` del contrato,
 * así que cuenta la más tardía entre la del contrato y las de sus adendas.
 */
export function finEfectivoDelContrato(fechaFin: Date, adendas: { fechaFin: Date | null }[]): Date {
  let fin = fechaFin.getTime();
  for (const a of adendas) if (a.fechaFin && a.fechaFin.getTime() > fin) fin = a.fechaFin.getTime();
  return new Date(fin);
}
