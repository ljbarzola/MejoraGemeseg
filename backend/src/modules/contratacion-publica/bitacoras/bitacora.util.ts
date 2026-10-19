// Lo común de las bitácoras: categorías de novedad, horas, y la limpieza de lo
// que devuelve el modelo. El modelo es un lector, no una autoridad: todo lo que
// dice pasa por aquí antes de guardarse, y nada de lo que salga de esta
// función depende de que el modelo haya obedecido el formato.

export const CATEGORIAS_NOVEDAD = [
  'SIN_NOVEDAD',
  'ACCESO',
  'VEHICULOS',
  'RONDA',
  'ENTREGA_TURNO',
  'EQUIPOS',
  'INCIDENTE',
  'OTRO',
] as const;
export type CategoriaNovedad = (typeof CATEGORIAS_NOVEDAD)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaNovedad, string> = {
  SIN_NOVEDAD: 'Sin novedad',
  ACCESO: 'Ingreso o salida de personas',
  VEHICULOS: 'Vehículos',
  RONDA: 'Rondas',
  ENTREGA_TURNO: 'Cambio o entrega de turno',
  EQUIPOS: 'Equipos o instalaciones',
  INCIDENTE: 'Incidente de seguridad',
  OTRO: 'Otras',
};

// La gravedad sale de la categoría, no del modelo: así dos fotos con la misma
// novedad dan siempre la misma gravedad y Sistemas puede explicar por qué.
export type Gravedad = 'BAJA' | 'MEDIA' | 'ALTA';
export const GRAVEDAD_POR_CATEGORIA: Record<CategoriaNovedad, Gravedad> = {
  SIN_NOVEDAD: 'BAJA',
  ACCESO: 'BAJA',
  VEHICULOS: 'BAJA',
  RONDA: 'BAJA',
  ENTREGA_TURNO: 'BAJA',
  EQUIPOS: 'MEDIA',
  INCIDENTE: 'ALTA',
  OTRO: 'BAJA',
};

/** Minutos de diferencia que se toleran entre lo anotado y el horario del turno. */
export const TOLERANCIA_MINUTOS = 30;

export function esCategoria(v: unknown): v is CategoriaNovedad {
  return (
    typeof v === 'string' &&
    (CATEGORIAS_NOVEDAD as readonly string[]).includes(v)
  );
}

// ---------------------------------------------------------------- horas

/** "8", "8:30", "08:05", "8h30", "8 pm", "20.15" -> "HH:mm"; algo que no es hora -> null. */
export function normalizarHora(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const t = String(valor).trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?:[:h.](\d{2}))?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const sufijo = m[3]?.[0];
  if (sufijo === 'p' && h < 12) h += 12;
  if (sufijo === 'a' && h === 12) h = 0;
  if (h === 24 && min === 0) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/** Diferencia entre dos horas del reloj, contando la vuelta a medianoche (23:50 y 00:10 = 20 min). */
export function diferenciaMinutos(a: string, b: string): number {
  const d = Math.abs(minutosDelDia(a) - minutosDelDia(b));
  return Math.min(d, 1440 - d);
}

// ---------------------------------------------------------------- fechas

export function esFechaISO(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ---------------------------------------------------------------- lectura

export interface LecturaRegistro {
  fecha: string;
  guardia: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  legible: boolean;
}

export interface LecturaNovedad {
  fecha: string | null;
  hora: string | null;
  guardia: string | null;
  texto: string;
  categoria: CategoriaNovedad;
}

export interface LecturaBitacora {
  esBitacora: boolean;
  puesto: string | null;
  fechas: string[];
  registros: LecturaRegistro[];
  novedades: LecturaNovedad[];
  observaciones: string | null;
}

/** Lo que devuelve el modelo, sin confiar en nada: cada campo se revisa antes de usarlo. */
interface RegistroCrudo {
  fecha?: unknown;
  guardia?: unknown;
  horaEntrada?: unknown;
  horaSalida?: unknown;
  legible?: unknown;
}
interface NovedadCruda {
  fecha?: unknown;
  hora?: unknown;
  guardia?: unknown;
  texto?: unknown;
  categoria?: unknown;
}
interface LecturaCruda {
  esBitacora?: unknown;
  puesto?: unknown;
  fechas?: unknown;
  registros?: unknown;
  novedades?: unknown;
  observaciones?: unknown;
}

const MAX_REGISTROS = 200;
const MAX_NOVEDADES = 300;

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Convierte lo que devolvió el modelo en una lectura válida. Descarta lo que no
 * se entiende (fecha inválida, línea sin guardia) y lo cuenta en `observaciones`
 * para que la persona lo vea, en vez de guardarlo roto o perderlo en silencio.
 */
export function normalizarLectura(crudo: unknown): LecturaBitacora {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as LecturaCruda;
  const avisos: string[] = [];

  const fechas = new Set<string>();
  const agregarFecha = (f: unknown): string | null => {
    if (esFechaISO(f)) {
      fechas.add(f);
      return f;
    }
    return null;
  };
  if (Array.isArray(o.fechas)) (o.fechas as unknown[]).forEach(agregarFecha);

  let descartadas = 0;
  const registros: LecturaRegistro[] = [];
  const registrosCrudos = (
    Array.isArray(o.registros) ? o.registros.slice(0, MAX_REGISTROS) : []
  ) as RegistroCrudo[];
  for (const r of registrosCrudos) {
    const guardia = texto(r?.guardia, 120);
    const fecha = agregarFecha(r?.fecha);
    if (!guardia || !fecha) {
      descartadas++;
      continue;
    }
    registros.push({
      fecha,
      guardia,
      horaEntrada: normalizarHora(r?.horaEntrada),
      horaSalida: normalizarHora(r?.horaSalida),
      legible: r?.legible !== false,
    });
  }
  if (descartadas) {
    avisos.push(
      `${descartadas} línea(s) de guardia se descartaron por no tener nombre o fecha legibles.`,
    );
  }

  const novedades: LecturaNovedad[] = [];
  const novedadesCrudas = (
    Array.isArray(o.novedades) ? o.novedades.slice(0, MAX_NOVEDADES) : []
  ) as NovedadCruda[];
  for (const n of novedadesCrudas) {
    const t = texto(n?.texto, 1000);
    if (!t) continue;
    novedades.push({
      fecha: agregarFecha(n?.fecha),
      hora: normalizarHora(n?.hora),
      guardia: texto(n?.guardia, 120),
      texto: t,
      categoria: esCategoria(n.categoria) ? n.categoria : 'OTRO',
    });
  }

  const observaciones =
    [texto(o.observaciones, 1000), ...avisos].filter(Boolean).join(' ') || null;

  return {
    esBitacora: o.esBitacora !== false,
    puesto: texto(o.puesto, 200),
    fechas: [...fechas].sort(),
    registros,
    novedades,
    observaciones,
  };
}
