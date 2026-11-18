// Dashboard de Contratación Pública (2026-11-18): cifras por entidad. Lógica pura (sin base de
// datos) para poder probarla; el servicio solo trae las filas y llama a `armarDashboard`.
// Las fechas son días de Ecuador en texto YYYY-MM-DD (nunca el día UTC de un timestamp).
import { PROVINCIAS_EC } from '../../ventas/ubicacion.util';

export type TipoEntidad = 'PUBLICA' | 'PRIVADA';

export interface EntidadFila {
  id: number;
  nombre: string;
  tipo: string;
  ruc: string | null;
  direccion: string | null;
  sector: string | null;
  provincia: string | null;
}

export interface ContratoFila {
  id: number;
  entidadId: number;
  numero: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
  valorTotal: number | null;
  administradorNombre: string | null;
  puestos: number;
}

export interface EntregaFila {
  entidadId: number;
  estado: string;
  fechaLimite: string;
  /** Día de Ecuador en que se entregó (null si no se entregó). */
  entregadoDia: string | null;
}

export interface BitacoraFila {
  entidadId: number;
  resultado: string;
  hallazgosAbiertos: number;
}

export interface FaltaFila {
  contratoId: number;
  estado: string;
}

export interface VisitaFila {
  contratoId: number;
}

export interface EntradaDashboard {
  hoy: string;
  entidades: EntidadFila[];
  contratos: ContratoFila[];
  entregas: EntregaFila[];
  /** null = la persona no ve Operaciones: los bloques de bitácoras y faltas no se arman. */
  operaciones: { bitacoras: BitacoraFila[]; faltas: FaltaFila[]; visitas: VisitaFila[] } | null;
}

/** Número de contrato con que se cargaron los horarios antes de tener el contrato real. */
export const NUMERO_POR_COMPLETAR = 'POR COMPLETAR';

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Vigente = activo y la fecha de hoy cae entre su inicio y su fin. */
export const esVigente = (c: ContratoFila, hoy: string) =>
  c.estado === 'ACTIVO' && c.fechaInicio <= hoy && hoy <= c.fechaFin;

export const esPorCompletar = (c: ContratoFila) =>
  c.numero.trim().toUpperCase().startsWith(NUMERO_POR_COMPLETAR);

/** Qué le falta a una entidad, en palabras de la pantalla. */
export function faltantesDe(e: EntidadFila, contratos: ContratoFila[]): string[] {
  const f: string[] = [];
  if (!e.ruc?.trim()) f.push('RUC');
  if (!e.direccion?.trim()) f.push('Dirección');
  if (!e.sector) f.push('Sector');
  if (!e.provincia) f.push('Provincia');
  const activos = contratos.filter((c) => c.estado === 'ACTIVO');
  if (activos.length === 0) {
    f.push('Contrato');
    return f;
  }
  if (activos.some(esPorCompletar)) f.push('Número del contrato');
  if (activos.some((c) => c.valorTotal === null || c.valorTotal === 0)) f.push('Valor del contrato');
  if (activos.some((c) => !c.administradorNombre?.trim())) f.push('Administrador del contrato');
  return f;
}

/** Una entrega en una sola de cuatro cajas, en este orden. */
export function cajaDeEntrega(e: EntregaFila, hoy: string): 'rechazadas' | 'aTiempo' | 'atrasadas' | 'pendientes' {
  if (e.estado === 'RECHAZADO') return 'rechazadas';
  if (e.estado === 'ENTREGADO' || e.estado === 'APROBADO') {
    return e.entregadoDia && e.entregadoDia > e.fechaLimite ? 'atrasadas' : 'aTiempo';
  }
  return e.fechaLimite < hoy ? 'atrasadas' : 'pendientes';
}

export function armarDashboard(d: EntradaDashboard) {
  const { hoy } = d;
  const porEntidad = new Map<number, ContratoFila[]>();
  for (const c of d.contratos) {
    const lista = porEntidad.get(c.entidadId) ?? [];
    lista.push(c);
    porEntidad.set(c.entidadId, lista);
  }
  const entidadDe = new Map(d.entidades.map((e) => [e.id, e]));
  const contratoDe = new Map(d.contratos.map((c) => [c.id, c]));
  const vigentes = d.contratos.filter((c) => esVigente(c, hoy));

  // ---------------------------------------------------------------- cifras de arriba
  const porVencer = vigentes
    .map((c) => ({ c, dias: diasEntre(hoy, c.fechaFin) }))
    .filter((x) => x.dias >= 0 && x.dias <= 90);
  const kpis = {
    entidades: d.entidades.length,
    publicas: d.entidades.filter((e) => e.tipo !== 'PRIVADA').length,
    privadas: d.entidades.filter((e) => e.tipo === 'PRIVADA').length,
    conContratoVigente: new Set(vigentes.map((c) => c.entidadId)).size,
    porVencer30: porVencer.filter((x) => x.dias <= 30).length,
    porVencer60: porVencer.filter((x) => x.dias <= 60).length,
    porVencer90: porVencer.length,
    valorVigente: vigentes.reduce((s, c) => s + (c.valorTotal ?? 0), 0),
    vigentesSinValor: vigentes.filter((c) => !c.valorTotal).length,
  };

  // ---------------------------------------------------------------- datos por completar
  const datosPorCompletar = d.entidades
    .map((e) => {
      const contratos = porEntidad.get(e.id) ?? [];
      const activo = contratos.find((c) => c.estado === 'ACTIVO') ?? null;
      return { entidadId: e.id, nombre: e.nombre, tipo: e.tipo, contratoId: activo?.id ?? null, faltan: faltantesDe(e, contratos) };
    })
    .filter((x) => x.faltan.length > 0)
    .sort((a, b) => b.faltan.length - a.faltan.length || a.nombre.localeCompare(b.nombre, 'es'));

  // ---------------------------------------------------------------- contratos y vencimientos
  const valorPorEntidad = d.entidades
    .map((e) => {
      const vs = vigentes.filter((c) => c.entidadId === e.id);
      return { entidadId: e.id, nombre: e.nombre, tipo: e.tipo, contratos: vs.length, valor: vs.reduce((s, c) => s + (c.valorTotal ?? 0), 0) };
    })
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const contratos = {
    valorPorEntidad,
    valorPublicas: valorPorEntidad.filter((x) => x.tipo !== 'PRIVADA').reduce((s, x) => s + x.valor, 0),
    valorPrivadas: valorPorEntidad.filter((x) => x.tipo === 'PRIVADA').reduce((s, x) => s + x.valor, 0),
    porVencer: porVencer
      .sort((a, b) => a.dias - b.dias)
      .map(({ c, dias }) => ({ contratoId: c.id, numero: c.numero, entidadId: c.entidadId, entidadNombre: entidadDe.get(c.entidadId)?.nombre ?? '', fechaFin: c.fechaFin, dias })),
  };

  // ---------------------------------------------------------------- entregas
  const cajas = new Map<number, { total: number; aTiempo: number; atrasadas: number; rechazadas: number; pendientes: number }>();
  for (const e of d.entregas) {
    if (!entidadDe.has(e.entidadId)) continue;
    const c = cajas.get(e.entidadId) ?? { total: 0, aTiempo: 0, atrasadas: 0, rechazadas: 0, pendientes: 0 };
    c.total++;
    c[cajaDeEntrega(e, hoy)]++;
    cajas.set(e.entidadId, c);
  }
  const entregasPorEntidad = [...cajas.entries()]
    .map(([entidadId, c]) => ({ entidadId, nombre: entidadDe.get(entidadId)!.nombre, ...c }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.total - a.total);
  const suma = (k: 'total' | 'aTiempo' | 'atrasadas' | 'rechazadas' | 'pendientes') => entregasPorEntidad.reduce((s, x) => s + x[k], 0);
  const entregas = {
    total: suma('total'), aTiempo: suma('aTiempo'), atrasadas: suma('atrasadas'), rechazadas: suma('rechazadas'), pendientes: suma('pendientes'),
    porEntidad: entregasPorEntidad,
  };

  // ---------------------------------------------------------------- mapa
  const provincias = new Map<string, { entidades: number; puestos: number }>();
  let sinProvincia = 0;
  for (const e of d.entidades) {
    if (!e.provincia) { sinProvincia++; continue; }
    const p = provincias.get(e.provincia) ?? { entidades: 0, puestos: 0 };
    p.entidades++;
    p.puestos += (porEntidad.get(e.id) ?? []).filter((c) => c.estado === 'ACTIVO').reduce((s, c) => s + c.puestos, 0);
    provincias.set(e.provincia, p);
  }
  const mapa = {
    sinProvincia,
    provincias: PROVINCIAS_EC.filter((p) => provincias.has(p.nombre)).map((p) => ({ provincia: p.nombre, lat: p.lat, lng: p.lng, ...provincias.get(p.nombre)! })),
  };

  // ---------------------------------------------------------------- operaciones (bitácoras, faltas, visitas)
  let operaciones: null | {
    bitacoras: { total: number; conErrores: number; hallazgosAbiertos: number; porEntidad: { entidadId: number; nombre: string; hojas: number; conErrores: number; hallazgosAbiertos: number }[] };
    faltas: { total: number; cubiertas: number; sinCubrir: number; visitas: number; porEntidad: { entidadId: number; nombre: string; faltas: number; cubiertas: number; sinCubrir: number; visitas: number }[] };
  } = null;
  if (d.operaciones) {
    const bit = new Map<number, { hojas: number; conErrores: number; hallazgosAbiertos: number }>();
    for (const b of d.operaciones.bitacoras) {
      if (!entidadDe.has(b.entidadId)) continue;
      const x = bit.get(b.entidadId) ?? { hojas: 0, conErrores: 0, hallazgosAbiertos: 0 };
      x.hojas++;
      if (b.resultado === 'CON_ERRORES') x.conErrores++;
      x.hallazgosAbiertos += b.hallazgosAbiertos;
      bit.set(b.entidadId, x);
    }
    const bitPorEntidad = [...bit.entries()]
      .map(([entidadId, x]) => ({ entidadId, nombre: entidadDe.get(entidadId)!.nombre, ...x }))
      .sort((a, b) => b.hallazgosAbiertos - a.hallazgosAbiertos || b.conErrores - a.conErrores || b.hojas - a.hojas);

    const fal = new Map<number, { faltas: number; cubiertas: number; sinCubrir: number; visitas: number }>();
    const cajaFalta = (contratoId: number) => {
      const entidadId = contratoDe.get(contratoId)?.entidadId;
      if (entidadId === undefined || !entidadDe.has(entidadId)) return null;
      const x = fal.get(entidadId) ?? { faltas: 0, cubiertas: 0, sinCubrir: 0, visitas: 0 };
      fal.set(entidadId, x);
      return x;
    };
    for (const f of d.operaciones.faltas) {
      if (f.estado === 'ANULADA') continue;
      const x = cajaFalta(f.contratoId);
      if (!x) continue;
      x.faltas++;
      if (f.estado === 'CUBIERTA') x.cubiertas++;
      else x.sinCubrir++;
    }
    for (const v of d.operaciones.visitas) {
      const x = cajaFalta(v.contratoId);
      if (x) x.visitas++;
    }
    const falPorEntidad = [...fal.entries()]
      .map(([entidadId, x]) => ({ entidadId, nombre: entidadDe.get(entidadId)!.nombre, ...x }))
      .sort((a, b) => b.sinCubrir - a.sinCubrir || b.faltas - a.faltas || b.visitas - a.visitas);
    operaciones = {
      bitacoras: {
        total: bitPorEntidad.reduce((s, x) => s + x.hojas, 0),
        conErrores: bitPorEntidad.reduce((s, x) => s + x.conErrores, 0),
        hallazgosAbiertos: bitPorEntidad.reduce((s, x) => s + x.hallazgosAbiertos, 0),
        porEntidad: bitPorEntidad,
      },
      faltas: {
        total: falPorEntidad.reduce((s, x) => s + x.faltas, 0),
        cubiertas: falPorEntidad.reduce((s, x) => s + x.cubiertas, 0),
        sinCubrir: falPorEntidad.reduce((s, x) => s + x.sinCubrir, 0),
        visitas: falPorEntidad.reduce((s, x) => s + x.visitas, 0),
        porEntidad: falPorEntidad,
      },
    };
  }

  return { hoy, kpis, datosPorCompletar, contratos, entregas, mapa, operaciones };
}

export type DashboardCP = ReturnType<typeof armarDashboard>;
