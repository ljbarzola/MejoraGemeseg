export interface TramoPatron {
  codigoTurno: string;
  dias: number;
}

export interface GuardiaOrdenPatron {
  cedula: string;
  nombreGuardia: string;
}

export interface CeldaGenerada {
  cedula: string;
  nombreGuardia: string;
  fecha: string; // YYYY-MM-DD
  codigoTurno: string;
}

export interface CalcularPatronInput {
  tramos: TramoPatron[];
  coberturaSimultanea: number;
  ordenGuardias: GuardiaOrdenPatron[];
  fechaInicioCiclo: string; // YYYY-MM-DD
  fechaInicio: string; // YYYY-MM-DD, primer día a generar
  fechaFin: string; // YYYY-MM-DD, último día a generar (inclusive)
}

export type ResultadoPatron =
  | {
      ok: true;
      celdas: CeldaGenerada[];
      cicloLongitud: number;
      numGrupos: number;
      desfaseDias: number;
    }
  | { ok: false; error: string };

function parseFechaUTC(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map((n) => parseInt(n, 10));
  return Date.UTC(anio, mes - 1, dia);
}

function formatFechaUTC(timestamp: number): string {
  const d = new Date(timestamp);
  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

const MS_POR_DIA = 86400000;

/**
 * Calcula el patrón de rotación cíclico de un puesto: agrupa a los guardias
 * en grupos desfasados entre sí según la cobertura simultánea requerida, y
 * asigna a cada uno el código de turno que le corresponde cada día del
 * rango, según su posición en el ciclo de tramos. Es la única fuente de
 * verdad del cálculo — se usa tanto para el preview como para la generación
 * real, así nunca pueden divergir (ver plan).
 */
export function calcularPatronRotacion(
  input: CalcularPatronInput,
): ResultadoPatron {
  const { tramos, coberturaSimultanea, ordenGuardias } = input;

  const cicloLongitud = tramos.reduce((sum, t) => sum + t.dias, 0);
  if (tramos.length === 0 || cicloLongitud <= 0) {
    return {
      ok: false,
      error: 'El patrón debe tener al menos un tramo con días mayor a 0.',
    };
  }
  if (tramos.some((t) => t.dias <= 0)) {
    return {
      ok: false,
      error: 'Todos los tramos deben tener una cantidad de días mayor a 0.',
    };
  }
  if (!Number.isInteger(coberturaSimultanea) || coberturaSimultanea <= 0) {
    return {
      ok: false,
      error: 'La cobertura simultánea debe ser al menos 1.',
    };
  }
  if (ordenGuardias.length === 0) {
    return {
      ok: false,
      error: 'Debe indicar al menos un guardia para generar el patrón.',
    };
  }
  const cedulasUnicas = new Set(ordenGuardias.map((g) => g.cedula));
  if (cedulasUnicas.size !== ordenGuardias.length) {
    return {
      ok: false,
      error: 'Hay guardias repetidos en el orden del patrón.',
    };
  }
  if (coberturaSimultanea > ordenGuardias.length) {
    return {
      ok: false,
      error: `La cobertura simultánea (${coberturaSimultanea}) no puede ser mayor a la cantidad de guardias (${ordenGuardias.length}).`,
    };
  }
  if (ordenGuardias.length % coberturaSimultanea !== 0) {
    return {
      ok: false,
      error: `La cantidad de guardias (${ordenGuardias.length}) debe ser múltiplo de la cobertura simultánea (${coberturaSimultanea}). Agregue o quite guardias para que sea divisible.`,
    };
  }
  const numGrupos = ordenGuardias.length / coberturaSimultanea;
  if (cicloLongitud % numGrupos !== 0) {
    return {
      ok: false,
      error: `La duración del ciclo (${cicloLongitud} días) no se puede repartir en partes iguales entre los ${numGrupos} grupos de guardias. Ajuste los días de los tramos para que el ciclo sea múltiplo de ${numGrupos}.`,
    };
  }
  const desfaseDias = cicloLongitud / numGrupos;

  let fechaInicioCicloTs: number;
  let fechaInicioTs: number;
  let fechaFinTs: number;
  try {
    fechaInicioCicloTs = parseFechaUTC(input.fechaInicioCiclo);
    fechaInicioTs = parseFechaUTC(input.fechaInicio);
    fechaFinTs = parseFechaUTC(input.fechaFin);
  } catch {
    return { ok: false, error: 'Alguna de las fechas indicadas es inválida.' };
  }
  if (
    Number.isNaN(fechaInicioCicloTs) ||
    Number.isNaN(fechaInicioTs) ||
    Number.isNaN(fechaFinTs)
  ) {
    return { ok: false, error: 'Alguna de las fechas indicadas es inválida.' };
  }
  if (fechaFinTs < fechaInicioTs) {
    return {
      ok: false,
      error: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
    };
  }

  const cicloExpandido: string[] = [];
  for (const tramo of tramos) {
    for (let i = 0; i < tramo.dias; i++) cicloExpandido.push(tramo.codigoTurno);
  }

  const offsets = Array.from({ length: numGrupos }, (_, g) => g * desfaseDias);

  const celdas: CeldaGenerada[] = [];
  for (let ts = fechaInicioTs; ts <= fechaFinTs; ts += MS_POR_DIA) {
    const diffDias = Math.round((ts - fechaInicioCicloTs) / MS_POR_DIA);
    const posBase =
      ((diffDias % cicloLongitud) + cicloLongitud) % cicloLongitud;
    const fecha = formatFechaUTC(ts);

    for (let g = 0; g < numGrupos; g++) {
      const posGuardia =
        (((posBase - offsets[g]) % cicloLongitud) + cicloLongitud) %
        cicloLongitud;
      const codigoTurno = cicloExpandido[posGuardia];
      const guardiasGrupo = ordenGuardias.slice(
        g * coberturaSimultanea,
        (g + 1) * coberturaSimultanea,
      );
      for (const guardia of guardiasGrupo) {
        celdas.push({
          cedula: guardia.cedula,
          nombreGuardia: guardia.nombreGuardia,
          fecha,
          codigoTurno,
        });
      }
    }
  }

  return { ok: true, celdas, cicloLongitud, numGrupos, desfaseDias };
}
