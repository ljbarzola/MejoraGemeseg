/**
 * Reglas puras del Agente de Mejora Continua (sin base de datos, fáciles de probar).
 */

export const TIPOS_PROPUESTA = ['AUTOMATIZAR_ACTUAL', 'IDEA_NUEVA'] as const;
export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number];

export const ESTADOS_PROPUESTA = [
  'PENDIENTE',
  'PLAN_APROBADO',
  'CAMBIOS_PEDIDOS',
  'RECHAZADA',
  'MAS_TARDE',
  'EN_CURSO',
  'HECHA',
] as const;
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number];

export type AccionDecision = 'APROBAR' | 'PEDIR_CAMBIOS' | 'RECHAZAR' | 'MAS_TARDE';
export const ACCIONES_DECISION: AccionDecision[] = [
  'APROBAR',
  'PEDIR_CAMBIOS',
  'RECHAZAR',
  'MAS_TARDE',
];

/** Presupuesto semanal: cuántas propuestas aprobadas o en curso a la vez (pedido por Leidy). */
export const LIMITE_APROBADAS_A_LA_VEZ = 2;

/** Estados desde los que todavía se puede decidir. */
export const ESTADOS_DECIDIBLES: EstadoPropuesta[] = [
  'PENDIENTE',
  'MAS_TARDE',
  'CAMBIOS_PEDIDOS',
  'PLAN_APROBADO',
];

/** Estados que ocupan un lugar del presupuesto semanal. */
export const ESTADOS_QUE_OCUPAN_CUPO: EstadoPropuesta[] = ['PLAN_APROBADO', 'EN_CURSO'];

export const SEMANA_RE = /^\d{4}-W\d{2}$/;

/** Semana ISO («2026-W46», lunes a domingo) según la hora de Ecuador (UTC-5, sin horario de verano). */
export function semanaEcuador(ahora: Date = new Date()): string {
  const local = new Date(ahora.getTime() - 5 * 3600 * 1000);
  const t = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const anio = t.getUTCFullYear();
  const inicio = new Date(Date.UTC(anio, 0, 1));
  const n = Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
  return `${anio}-W${String(n).padStart(2, '0')}`;
}

export interface PropuestaEntrante {
  tipo: TipoPropuesta;
  titulo: string;
  queSeAutomatiza: string | null;
  decisionHumana: string | null;
  plan: string[];
  impacto: string | null;
  esfuerzo: string | null;
  riesgo: string | null;
  lineaBlanca: boolean;
  evidencia: string;
  dependeDe: string | null;
  porQueAhora: string | null;
  comoProbarBarato: string | null;
  horasAhorradasMes: number | null;
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** ALTO / MEDIO / BAJO a partir de lo que escriba el agente («alta», «Media»...). */
export function normalizarNivel(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (t.startsWith('ALT')) return 'ALTO';
  if (t.startsWith('MED')) return 'MEDIO';
  if (t.startsWith('BAJ')) return 'BAJO';
  return null;
}

/**
 * Valida una propuesta que llega de una rutina. Regla de Leidy: sin evidencia (el
 * .md y la sección, o el dato de uso que la motiva) no se acepta.
 */
export function normalizarPropuesta(
  raw: unknown,
): { ok: true; value: PropuestaEntrante } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'No es un objeto' };
  const r = raw as Record<string, unknown>;
  const titulo = texto(r.titulo, 200);
  if (!titulo) return { ok: false, error: 'Falta el título' };
  const tipo = typeof r.tipo === 'string' ? r.tipo.trim().toUpperCase() : '';
  if (!(TIPOS_PROPUESTA as readonly string[]).includes(tipo)) {
    return { ok: false, error: `«${titulo}»: el tipo debe ser AUTOMATIZAR_ACTUAL o IDEA_NUEVA` };
  }
  const evidencia = texto(r.evidencia, 1500);
  if (!evidencia) return { ok: false, error: `«${titulo}»: falta la evidencia` };
  const plan = Array.isArray(r.plan)
    ? r.plan
        .map((p) => texto(p, 400))
        .filter((p): p is string => !!p)
        .slice(0, 10)
    : [];
  if (plan.length === 0) {
    return { ok: false, error: `«${titulo}»: falta el plan (pasos «pantalla → acción → resultado»)` };
  }
  let horas: number | null = null;
  if (typeof r.horasAhorradasMes === 'number' && Number.isFinite(r.horasAhorradasMes)) {
    horas = Math.min(Math.max(r.horasAhorradasMes, 0), 1000);
  }
  return {
    ok: true,
    value: {
      tipo: tipo as TipoPropuesta,
      titulo,
      queSeAutomatiza: texto(r.queSeAutomatiza, 2000),
      decisionHumana: texto(r.decisionHumana, 2000),
      plan,
      impacto: normalizarNivel(r.impacto),
      esfuerzo: normalizarNivel(r.esfuerzo),
      riesgo: normalizarNivel(r.riesgo),
      lineaBlanca: r.lineaBlanca === true,
      evidencia,
      dependeDe: texto(r.dependeDe, 500),
      porQueAhora: texto(r.porQueAhora, 1000),
      comoProbarBarato: texto(r.comoProbarBarato, 1000),
      horasAhorradasMes: horas,
    },
  };
}

/** Lista de textos cortos (alertas, «mejorado», «faltó»...) de un informe. */
export function listaDeTextos(v: unknown, max = 15, largo = 500): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => texto(x, largo))
    .filter((x): x is string => !!x)
    .slice(0, max);
}

export function esSemanaValida(v: unknown): v is string {
  return typeof v === 'string' && SEMANA_RE.test(v);
}

export interface PropuestaParaBrief {
  id: number;
  tipo: string;
  titulo: string;
  semana: string;
  queSeAutomatiza: string | null;
  decisionHumana: string | null;
  plan: string[];
  impacto: string | null;
  esfuerzo: string | null;
  riesgo: string | null;
  lineaBlanca: boolean;
  evidencia: string | null;
  dependeDe: string | null;
  comentarioCambios: string | null;
}

/**
 * Texto autocontenido para abrir una sesión de Claude con una propuesta cuyo plan
 * ya aprobó Leidy. Repite sus reglas de trabajo porque la sesión nueva no
 * conoce esta conversación (aunque el repo trae su propio CLAUDE.md).
 */
export function armarBrief(p: PropuestaParaBrief): string {
  const pasos = p.plan.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `Implementar la propuesta de mejora continua #${p.id} («${p.titulo}», semana ${p.semana}), cuyo plan YA fue aprobado por Leidy en Sistemas → Mejora continua.`,
    '',
    `Tipo: ${p.tipo === 'IDEA_NUEVA' ? 'idea nueva' : 'automatizar lo actual'}. Impacto: ${p.impacto ?? '—'} · Esfuerzo: ${p.esfuerzo ?? '—'} · Riesgo: ${p.riesgo ?? '—'} · Sirve para línea blanca: ${p.lineaBlanca ? 'sí' : 'no'}.`,
    p.queSeAutomatiza ? `\nQué se automatiza: ${p.queSeAutomatiza}` : null,
    p.decisionHumana ? `\nDecisión humana que desaparece: ${p.decisionHumana}` : null,
    `\nPlan aprobado (pantalla → acción → resultado):\n${pasos}`,
    p.evidencia ? `\nEvidencia de la que salió: ${p.evidencia}` : null,
    p.dependeDe ? `\nDepende de: ${p.dependeDe}` : null,
    p.comentarioCambios
      ? `\nCorrecciones que pidió Leidy antes de aprobar (ya reflejadas en el plan): ${p.comentarioCambios}`
      : null,
    '',
    'Reglas de Leidy para esta sesión (también están en el CLAUDE.md del repo):',
    '- Empieza leyendo AGENTS.md y el .md del módulo que toques; explica las decisiones técnicas en español y con contexto.',
    '- Trabaja en una rama o worktree propio. Nada a main, y NO hagas commit, push, PR ni npm test hasta que ella pruebe en local y diga «ok».',
    '- Implementa, comprueba que compila y entrégalo para que lo pruebe. Si un archivo cambió en disco es trabajo ajeno: móntate encima, nunca lo reviertas.',
    '- Si hay más de un comportamiento razonable, pregunta antes de asumir. Nada de datos de una empresa concreta en el código (línea blanca).',
    '- Al terminar, resume qué cambió y qué no pudiste verificar; ella marcará la propuesta como hecha en Sistemas → Mejora continua.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}
