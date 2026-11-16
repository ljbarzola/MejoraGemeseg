/**
 * Metas comerciales (2026-11-13): reglas puras, sin base de datos.
 *
 *  · Tipos de meta: monto en USD, clientes nuevos e impactos.
 *  · Las metas se escriben por MES o por AÑO. La semana es la meta mensual entre 4
 *    (el ejemplo del asesor: 30,000 al mes son 7,500 a la semana).
 *  · El periodo del tablero (semana, mes, mes pasado, año) decide qué meta aplica; con
 *    «90 días» o un rango personalizado no hay meta y no se calcula porcentaje.
 *  · Todos los días son días de Ecuador ('YYYY-MM-DD'); aquí nunca se mira la hora.
 *
 * Monto vendido: HOY es el monto cotizado de las oportunidades aceptadas, en el día
 * en que se aceptaron. Cuando exista la conexión con contabilidad, solo cambia de
 * dónde sale ese número (VentasMetasService.avances); lo de aquí no se toca.
 */

export const TIPOS_META = ['MONTO', 'CLIENTES_NUEVOS', 'IMPACTOS'] as const;
export type TipoMeta = (typeof TIPOS_META)[number];

export type PeriodoMeta = 'SEMANA' | 'MES' | 'ANIO';

/** Lo que manda el tablero para decir qué atajo de periodo eligió la persona. */
export type PistaPeriodo = 'semana' | 'mes' | 'anio' | 'ninguno';

export interface FilaMeta {
  userId: number | null; // null = meta global de la empresa
  kind: TipoMeta;
  periodKind: 'MES' | 'ANIO';
  year: number;
  month: number; // 0 en las anuales
  target: number;
}

export interface PeriodoResuelto {
  periodo: PeriodoMeta;
  year: number;
  month: number; // mes de la meta que aplica (0 en el año)
  inicio: string; // primer día del periodo completo
  fin: string; // último día del periodo completo
  /** Qué parte del periodo completo ya pasó (0 a 1) al llegar a `hasta` o a hoy. */
  ritmo: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const aDia = (d: Date) => d.toISOString().slice(0, 10);
const deDia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const diasEntre = (a: string, b: string) => Math.round((deDia(b).getTime() - deDia(a).getTime()) / DIA_MS);
const esDiaValido = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(deDia(s).getTime());

const ultimoDiaDelMes = (year: number, month: number) => aDia(new Date(Date.UTC(year, month, 0)));

/**
 * Qué periodo de metas es un desde/hasta. Con `pista` (lo que eligió la persona en el tablero) no hay
 * ambigüedad: «Este mes» y «Este año» valen lo mismo en enero. Sin pista se deduce del rango.
 * Devuelve null cuando el rango no es una semana, un mes ni un año: ahí no hay meta.
 */
export function resolverPeriodo(
  desde: string,
  hasta: string,
  hoy: string,
  pista?: PistaPeriodo,
): PeriodoResuelto | null {
  if (!esDiaValido(desde) || !esDiaValido(hasta) || !esDiaValido(hoy) || desde > hasta) return null;
  if (pista === 'ninguno') return null;
  const [y, m, d] = desde.split('-').map(Number);

  const esSemana = () => {
    const dow = (deDia(desde).getUTCDay() + 6) % 7;
    return dow === 0 && diasEntre(desde, hasta) <= 6;
  };
  const esMes = () => d === 1 && hasta.slice(0, 7) === desde.slice(0, 7);
  const esAnio = () => desde === `${y}-01-01` && Number(hasta.slice(0, 4)) === y;

  let periodo: PeriodoMeta | null = null;
  if (pista === 'semana') periodo = 'SEMANA';
  else if (pista === 'mes') periodo = 'MES';
  else if (pista === 'anio') periodo = 'ANIO';
  else if (esMes()) periodo = 'MES';
  else if (esAnio()) periodo = 'ANIO';
  else if (esSemana()) periodo = 'SEMANA';
  if (!periodo) return null;

  let inicio: string;
  let fin: string;
  let month = m;
  if (periodo === 'ANIO') {
    inicio = `${y}-01-01`;
    fin = `${y}-12-31`;
    month = 0;
  } else if (periodo === 'MES') {
    inicio = `${y}-${String(m).padStart(2, '0')}-01`;
    fin = ultimoDiaDelMes(y, m);
  } else {
    inicio = desde;
    fin = aDia(new Date(deDia(desde).getTime() + 6 * DIA_MS));
  }

  const corte = hasta < hoy ? hasta : hoy;
  const total = diasEntre(inicio, fin) + 1;
  const pasados = Math.min(Math.max(diasEntre(inicio, corte) + 1, 0), total);
  return { periodo, year: y, month, inicio, fin, ritmo: pasados / total };
}

/**
 * La meta que aplica a una persona (o a la empresa si userId es null) en el periodo, o null si gerencia aún
 * no la fijó. La semana es la meta del mes de su lunes entre 4.
 */
export function buscarMeta(
  filas: FilaMeta[],
  userId: number | null,
  kind: TipoMeta,
  p: Pick<PeriodoResuelto, 'periodo' | 'year' | 'month'>,
): number | null {
  const periodKind = p.periodo === 'ANIO' ? 'ANIO' : 'MES';
  const fila = filas.find(
    (f) => f.userId === userId && f.kind === kind && f.periodKind === periodKind && f.year === p.year && f.month === (periodKind === 'ANIO' ? 0 : p.month),
  );
  if (!fila) return null;
  const meta = p.periodo === 'SEMANA' ? fila.target / 4 : fila.target;
  return Math.round(meta * 100) / 100;
}

export type EstadoMeta = 'SIN_META' | 'VERDE' | 'AMARILLO' | 'ROJO';

export interface Cumplimiento {
  meta: number | null;
  avance: number;
  /** Porcentaje de la meta (puede pasar de 100). null si no hay meta o es 0. */
  pct: number | null;
  /** Lo que falta para la meta (negativo si ya la superó). null si no hay meta. */
  brecha: number | null;
  estado: EstadoMeta;
}

/**
 * Verde si va al ritmo del periodo (o ya cumplió), amarillo si va a menos del ritmo pero a más de su 80 %, rojo
 * debajo de eso. A mitad de mes, 50 % de la meta es ir bien; cerrado el mes, solo 100 % lo es.
 */
export function cumplimiento(meta: number | null, avance: number, ritmo: number): Cumplimiento {
  const av = Math.round(avance * 100) / 100;
  if (meta === null) return { meta: null, avance: av, pct: null, brecha: null, estado: 'SIN_META' };
  const brecha = Math.round((meta - av) * 100) / 100;
  if (!(meta > 0)) return { meta, avance: av, pct: null, brecha, estado: 'SIN_META' };
  const pct = Math.round((av / meta) * 1000) / 10;
  const esperado = Math.min(Math.max(ritmo, 0), 1) * 100;
  const estado: EstadoMeta = pct >= 100 || pct >= esperado ? 'VERDE' : pct >= esperado * 0.8 ? 'AMARILLO' : 'ROJO';
  return { meta, avance: av, pct, brecha, estado };
}

// ---------------------------------------------------------------------------
// Avance
// ---------------------------------------------------------------------------

export interface VentaAceptada {
  id: number;
  salesClientId: number;
  assignedUserId: number | null;
  quotedAmount: number | null;
  /** Día de Ecuador en que se aceptó ('YYYY-MM-DD'). */
  dia: string;
}

export interface AvanceTipos {
  MONTO: number;
  CLIENTES_NUEVOS: number;
  IMPACTOS: number;
  /** Aceptadas sin monto cotizado: cuentan como impacto pero suman 0 al monto. */
  sinMonto: number;
}

export const avanceVacio = (): AvanceTipos => ({ MONTO: 0, CLIENTES_NUEVOS: 0, IMPACTOS: 0, sinMonto: 0 });

/**
 * Avance de toda la empresa y de cada responsable a partir de las ventas aceptadas del periodo.
 *  · Impacto = cada oportunidad aceptada.
 *  · Monto = suma de sus montos cotizados.
 *  · Cliente nuevo = empresa o persona sin compra anterior (`conCompraPrevia`); cuenta UNA vez y se le
 *    atribuye al responsable de su primera venta del periodo.
 * Las ventas sin responsable suman a la empresa pero a ningún vendedor (clave 0).
 */
export function calcularAvances(
  ventas: VentaAceptada[],
  conCompraPrevia: Set<number>,
): { empresa: AvanceTipos; porVendedor: Map<number, AvanceTipos> } {
  const empresa = avanceVacio();
  const porVendedor = new Map<number, AvanceTipos>();
  const de = (id: number | null) => {
    const k = id ?? 0;
    let a = porVendedor.get(k);
    if (!a) {
      a = avanceVacio();
      porVendedor.set(k, a);
    }
    return a;
  };
  const primeraDeCliente = new Map<number, VentaAceptada>();
  const ordenadas = [...ventas].sort((a, b) => (a.dia === b.dia ? a.id - b.id : a.dia < b.dia ? -1 : 1));
  for (const v of ordenadas) {
    const monto = v.quotedAmount ?? 0;
    for (const a of [empresa, de(v.assignedUserId)]) {
      a.MONTO += monto;
      a.IMPACTOS += 1;
      if (v.quotedAmount === null) a.sinMonto += 1;
    }
    if (!primeraDeCliente.has(v.salesClientId)) primeraDeCliente.set(v.salesClientId, v);
  }
  for (const [clienteId, v] of primeraDeCliente) {
    if (conCompraPrevia.has(clienteId)) continue;
    empresa.CLIENTES_NUEVOS += 1;
    de(v.assignedUserId).CLIENTES_NUEVOS += 1;
  }
  empresa.MONTO = Math.round(empresa.MONTO * 100) / 100;
  for (const a of porVendedor.values()) a.MONTO = Math.round(a.MONTO * 100) / 100;
  return { empresa, porVendedor };
}

// ---------------------------------------------------------------------------
// Alcance
// ---------------------------------------------------------------------------

/**
 * A quién se miran las cifras: null = toda la empresa, número = un vendedor. Es la misma regla de la
 * analítica del Dashboard: elegir a OTRA persona es solo de ADMIN y MANAGER; sin elegir, un empleado ve
 * lo suyo y un ADMIN/MANAGER ve a toda la empresa.
 */
export function vendedorDelAlcance(a: { userId: number; role: string; alcance?: string }): number | null {
  const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
  if (a.alcance === 'all') return null;
  if (a.alcance === 'mine') return a.userId;
  if (!privilegiado) return a.userId;
  if (!a.alcance) return null;
  const id = Number(a.alcance);
  return Number.isInteger(id) && id > 0 ? id : null;
}
