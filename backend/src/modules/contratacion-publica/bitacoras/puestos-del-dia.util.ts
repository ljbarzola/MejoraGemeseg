// «Hoy en los puestos»: lo primero que mira un supervisor al empezar el turno y el jefe de supervisores
// durante el día. Para cada puesto de un contrato activo dice quién debe estar hoy según el horario,
// si la cobertura mínima se cumple, y qué días de la última semana no tienen bitácora subida aunque
// el horario decía que había guardias trabajando. Es código fijo sobre lo que ya existe (horario y
// bitácoras): no guarda nada. Las faltas registradas con «No llegó» (CPAusencia) se muestran junto al
// guardia y descuentan de la cobertura mientras nadie lo cubra.

import type { CodigoTurnoInfo } from './bitacora-revisor.util';

export const DIAS_VENTANA_BITACORAS = 7;

const MS_DIA = 86_400_000;

export interface PuestoBase {
  id: number;
  nombre: string;
  contratoId: number;
  contratoNumero: string;
  entidadNombre: string;
  /** PUBLICA o PRIVADA (sin dato = pública). */
  entidadTipo?: string;
  /** Cuántos guardias deben estar trabajando a la vez cada día. */
  minimo: number;
}

export interface HorarioQueCubre {
  contratoId: number;
  estado: string;
}

export interface CeldaDeHoy {
  puestoId: number;
  cedula: string;
  nombre: string;
  codigo: string;
}

export interface AusenciaDelDia {
  id: number;
  puestoId: number;
  cedula: string;
  /** POR_CUBRIR | CUBIERTA (las anuladas no llegan aquí). */
  estado: string;
  motivo: string;
  hora: string | null;
  nota: string | null;
  reemplazoNombre: string | null;
}

export type AusenciaDeGuardia = Omit<AusenciaDelDia, 'puestoId' | 'cedula'>;

export interface EntradaPuestosDelDia {
  /** Hoy (YYYY-MM-DD, día de Ecuador). */
  fecha: string;
  puestos: PuestoBase[];
  /** Horarios del contrato que cubren hoy (un contrato no puede tener dos que se crucen). */
  horariosHoy: HorarioQueCubre[];
  celdasHoy: CeldaDeHoy[];
  codigos: Record<string, CodigoTurnoInfo>;
  /** Celdas de los días anteriores de la ventana, solo de horarios APROBADOS. */
  celdasPasadas: { puestoId: number; fecha: string; codigo: string }[];
  /** Días que ya cubre alguna bitácora de cada puesto. */
  bitacoras: { puestoId: number; fechas: string[] }[];
  /** Faltas registradas hoy con «No llegó» (sin las anuladas). */
  ausencias?: AusenciaDelDia[];
}

export interface GuardiaDelDia {
  cedula: string;
  nombre: string;
  codigo: string;
  horaInicio: string | null;
  horaFin: string | null;
  /** La falta registrada hoy de este guardia, o null si no ha faltado. */
  ausencia: AusenciaDeGuardia | null;
}

export type EstadoCobertura = 'CUBIERTO' | 'SIN_CUBRIR' | 'SIN_HORARIO' | 'HORARIO_NO_APROBADO';

export interface PuestoDelDia {
  puestoId: number;
  puestoNombre: string;
  contratoId: number;
  contratoNumero: string;
  entidadNombre: string;
  entidadTipo: string;
  /** Estado del horario que cubre hoy, o null si no hay ninguno. */
  horarioEstado: string | null;
  cobertura: EstadoCobertura;
  minimo: number;
  trabajando: GuardiaDelDia[];
  /** Faltas de hoy sin nadie que las cubra. */
  ausentesSinCubrir: number;
  libres: { cedula: string; nombre: string; codigo: string }[];
  /** Días de la última semana con guardias trabajando según el horario y ninguna bitácora subida. */
  bitacorasSinSubir: string[];
}

export interface ResumenPuestosDelDia {
  fecha: string;
  puestos: number;
  sinHorario: number;
  sinCubrir: number;
  /** Faltas de hoy, en todos los puestos, sin nadie que las cubra. */
  faltasSinCubrir: number;
  conBitacorasSinSubir: number;
}

const ORDEN_ESTADO_HORARIO: Record<string, number> = { APROBADO: 0, ENVIADO: 1, BORRADOR: 2, RECHAZADO: 3 };

/** Los `n` días anteriores a una fecha ISO (de más antiguo a más reciente). */
export function diasAnteriores(iso: string, n: number): string[] {
  const [a, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(a, m - 1, d);
  return Array.from({ length: n }, (_, i) =>
    new Date(base - (n - i) * MS_DIA).toISOString().slice(0, 10),
  );
}

const prioridad = (p: PuestoDelDia): number => {
  if (p.cobertura === 'SIN_HORARIO') return 0;
  if (p.cobertura === 'SIN_CUBRIR' || p.ausentesSinCubrir > 0) return 1;
  if (p.bitacorasSinSubir.length > 0) return 2;
  if (p.cobertura === 'HORARIO_NO_APROBADO') return 3;
  return 4;
};

function ausenciaDe(a: AusenciaDelDia | undefined): AusenciaDeGuardia | null {
  if (!a) return null;
  return { id: a.id, estado: a.estado, motivo: a.motivo, hora: a.hora, nota: a.nota, reemplazoNombre: a.reemplazoNombre };
}

export function armarPuestosDelDia(entrada: EntradaPuestosDelDia): {
  resumen: ResumenPuestosDelDia;
  puestos: PuestoDelDia[];
} {
  const ventana = diasAnteriores(entrada.fecha, DIAS_VENTANA_BITACORAS);
  const sinBitacora = new Map<number, Set<string>>();
  for (const b of entrada.bitacoras) {
    const set = sinBitacora.get(b.puestoId) ?? new Set<string>();
    for (const f of b.fechas) set.add(f);
    sinBitacora.set(b.puestoId, set);
  }

  const faltas = new Map<string, AusenciaDelDia>();
  for (const a of entrada.ausencias ?? []) faltas.set(`${a.puestoId}|${a.cedula}`, a);

  const puestos: PuestoDelDia[] = entrada.puestos.map((p) => {
    const horarios = entrada.horariosHoy
      .filter((h) => h.contratoId === p.contratoId)
      .sort((a, b) => (ORDEN_ESTADO_HORARIO[a.estado] ?? 9) - (ORDEN_ESTADO_HORARIO[b.estado] ?? 9));
    const horarioEstado = horarios[0]?.estado ?? null;

    const trabajando: GuardiaDelDia[] = [];
    const libres: PuestoDelDia['libres'] = [];
    for (const c of entrada.celdasHoy.filter((x) => x.puestoId === p.id)) {
      const info = entrada.codigos[c.codigo];
      if (info?.esDescanso) {
        libres.push({ cedula: c.cedula, nombre: c.nombre, codigo: c.codigo });
      } else {
        trabajando.push({
          cedula: c.cedula,
          nombre: c.nombre,
          codigo: c.codigo,
          horaInicio: info?.horaInicio ?? null,
          horaFin: info?.horaFin ?? null,
          ausencia: ausenciaDe(faltas.get(`${p.id}|${c.cedula}`)),
        });
      }
    }
    trabajando.sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '') || a.nombre.localeCompare(b.nombre, 'es'));
    libres.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    // Quien faltó no cuenta, salvo que alguien lo cubra.
    const efectivos = trabajando.filter((g) => !g.ausencia || g.ausencia.estado === 'CUBIERTA').length;
    const ausentesSinCubrir = trabajando.filter((g) => g.ausencia?.estado === 'POR_CUBRIR').length;

    let cobertura: EstadoCobertura;
    if (!horarioEstado) cobertura = 'SIN_HORARIO';
    else if (efectivos < p.minimo) cobertura = 'SIN_CUBRIR';
    else if (horarioEstado !== 'APROBADO') cobertura = 'HORARIO_NO_APROBADO';
    else cobertura = 'CUBIERTO';

    // Días que el horario aprobado esperaba guardias y ninguna bitácora los cubre.
    const trabajaron = new Set(
      entrada.celdasPasadas
        .filter((c) => c.puestoId === p.id && !entrada.codigos[c.codigo]?.esDescanso)
        .map((c) => c.fecha),
    );
    const cubiertos = sinBitacora.get(p.id) ?? new Set<string>();
    const bitacorasSinSubir = ventana.filter((f) => trabajaron.has(f) && !cubiertos.has(f));

    return {
      puestoId: p.id,
      puestoNombre: p.nombre,
      contratoId: p.contratoId,
      contratoNumero: p.contratoNumero,
      entidadNombre: p.entidadNombre,
      entidadTipo: p.entidadTipo ?? 'PUBLICA',
      horarioEstado,
      cobertura,
      minimo: p.minimo,
      trabajando,
      ausentesSinCubrir,
      libres,
      bitacorasSinSubir,
    };
  });

  puestos.sort(
    (a, b) =>
      prioridad(a) - prioridad(b) ||
      a.entidadNombre.localeCompare(b.entidadNombre, 'es') ||
      a.puestoNombre.localeCompare(b.puestoNombre, 'es'),
  );

  return {
    resumen: {
      fecha: entrada.fecha,
      puestos: puestos.length,
      sinHorario: puestos.filter((p) => p.cobertura === 'SIN_HORARIO').length,
      sinCubrir: puestos.filter((p) => p.cobertura === 'SIN_CUBRIR').length,
      faltasSinCubrir: puestos.reduce((n, p) => n + p.ausentesSinCubrir, 0),
      conBitacorasSinSubir: puestos.filter((p) => p.bitacorasSinSubir.length > 0).length,
    },
    puestos,
  };
}
