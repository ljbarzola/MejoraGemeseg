// Quién podría cubrir a un guardia que no apareció en la bitácora. Es código fijo, no el modelo: se
// mira el horario del contrato ese día y se propone, en este orden, a quien del mismo puesto tenía
// descanso, a quien del mismo puesto no tenía turno, y lo mismo con los guardias de los otros puestos
// del contrato. Quien aparece en la hoja ese día (ya está trabajando) y quien tiene un turno que cubrir
// no se propone. Solo sugiere: quién cubre lo decide una persona.

import type { CodigoTurnoInfo } from './bitacora-revisor.util';

export interface GuardiaCandidato {
  cedula: string;
  nombre: string;
  /** Puesto al que está asignado (para decir de dónde saldría). */
  puestoId: number;
  puestoNombre: string;
}

export interface CeldaDelContrato {
  fecha: string; // YYYY-MM-DD
  cedula: string;
  codigo: string;
}

export interface EntradaReemplazo {
  /** Día a cubrir (YYYY-MM-DD). */
  fecha: string;
  /** Puesto donde faltó la persona. */
  puestoId: number;
  /** Cédula de quien faltó. */
  ausenteCedula: string;
  /** Guardias asignados al puesto y a los demás puestos del contrato. */
  guardias: GuardiaCandidato[];
  /** Celdas del horario del contrato para ese día y el anterior. */
  celdas: CeldaDelContrato[];
  codigos: Record<string, CodigoTurnoInfo>;
  /** Cédulas de quienes sí aparecen en la bitácora ese día (ya están trabajando). */
  presentes: string[];
}

export interface SugerenciaReemplazo {
  cedula: string;
  nombre: string;
  puestoNombre: string;
  mismoPuesto: boolean;
  /** Por qué se propone: «Tenía descanso (L) ese día», «No tenía turno ese día»… */
  motivo: string;
  /** Algo a tener en cuenta antes de llamarlo, o null. */
  aviso: string | null;
}

export const MAX_SUGERENCIAS = 5;

const MS_DIA = 86_400_000;

/** El día anterior a una fecha ISO. */
export function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) - MS_DIA).toISOString().slice(0, 10);
}

/** Un turno que termina antes de la hora a la que empieza cruza la medianoche (turno de noche). */
function cruzaMedianoche(info: CodigoTurnoInfo | undefined): boolean {
  if (!info?.horaInicio || !info?.horaFin) return false;
  return info.horaFin < info.horaInicio;
}

export function sugerirReemplazos(entrada: EntradaReemplazo): SugerenciaReemplazo[] {
  const anterior = diaAnterior(entrada.fecha);
  const presentes = new Set(entrada.presentes);
  const codigoDelDia = new Map<string, string>();
  const codigoDeAyer = new Map<string, string>();
  for (const c of entrada.celdas) {
    if (c.fecha === entrada.fecha) codigoDelDia.set(c.cedula, c.codigo);
    else if (c.fecha === anterior) codigoDeAyer.set(c.cedula, c.codigo);
  }

  const vistos = new Set<string>();
  const candidatos: (SugerenciaReemplazo & { rango: number })[] = [];

  for (const g of entrada.guardias) {
    if (g.cedula === entrada.ausenteCedula || presentes.has(g.cedula) || vistos.has(g.cedula)) continue;
    vistos.add(g.cedula);

    const codigo = codigoDelDia.get(g.cedula);
    const info = codigo ? entrada.codigos[codigo] : undefined;
    // Con un turno de trabajo ese día está ocupado.
    if (codigo && !info?.esDescanso) continue;

    const mismoPuesto = g.puestoId === entrada.puestoId;
    const descanso = !!codigo;
    const motivo = descanso
      ? `Tenía descanso (${codigo}) ese día`
      : 'No tenía turno ese día';

    const ayer = codigoDeAyer.get(g.cedula);
    const aviso =
      ayer && cruzaMedianoche(entrada.codigos[ayer])
        ? `Trabajó el turno de noche (${ayer}) el día anterior: confirmar que descansó`
        : null;

    candidatos.push({
      cedula: g.cedula,
      nombre: g.nombre,
      puestoNombre: g.puestoNombre,
      mismoPuesto,
      motivo,
      aviso,
      // Mismo puesto antes que otro; con descanso antes que sin turno; sin aviso antes que con aviso.
      rango: (mismoPuesto ? 0 : 4) + (descanso ? 0 : 2) + (aviso ? 1 : 0),
    });
  }

  return candidatos
    .sort((a, b) => a.rango - b.rango || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, MAX_SUGERENCIAS)
    .map(({ rango: _rango, ...resto }) => resto);
}

/** Cédula de quien faltó, tomada de la clave del hallazgo `GUARDIA_AUSENTE|fecha|cedula`. */
export function cedulaDeHallazgoAusente(clave: string): string | null {
  const [tipo, , cedula] = clave.split('|');
  return tipo === 'GUARDIA_AUSENTE' && cedula ? cedula : null;
}
