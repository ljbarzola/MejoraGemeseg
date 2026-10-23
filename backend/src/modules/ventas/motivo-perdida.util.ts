// Motivo con el que se perdió una oportunidad, para mostrarlo junto a la etapa «Perdida».
//
// El motivo se guarda en una tabla aparte (SalesReasonEntry) en la misma transacción que el cambio
// de etapa, pero sin enlazarse a él por id: aquí se vuelven a unir por oportunidad y cercanía en el
// tiempo, para que el Historial y la tabla de Oportunidades lo muestren sin pedirle nada nuevo a la base.

import { ETAPA_PERDIDA } from './stage-outcome.util';

// Una renovación perdida guarda su motivo como «contrato no renovado» (ver cambiarEtapa).
export const KINDS_MOTIVO_PERDIDA = ['OPP_PERDIDA', 'CONTRATO_NO_RENOVADO'];

// Lo que se perdió o descartó antes de que el sistema pidiera un motivo no tiene registro: se muestra y se cuenta con
// este mismo texto (es también un motivo del catálogo), así la dona, la lista y el medidor suman lo mismo.
export const MOTIVO_SIN_INFORMACION = 'Sin información';

export interface EntradaMotivoPerdida {
  opportunityId: number | null;
  kind: string;
  reasonLabel: string;
  comment: string | null;
  source: string | null;
  createdAt: Date;
}

export interface MotivoPerdida {
  label: string;
  comment: string | null;
  source: string | null;
}

const aMotivo = (e: EntradaMotivoPerdida): MotivoPerdida => ({
  label: e.reasonLabel,
  comment: e.comment,
  source: e.source,
});

// Último motivo de pérdida registrado de cada oportunidad (el de la pérdida más reciente).
export function ultimoMotivoPorOportunidad(entradas: EntradaMotivoPerdida[]): Map<number, MotivoPerdida> {
  const out = new Map<number, MotivoPerdida>();
  const ordenadas = [...entradas]
    .filter((e) => e.opportunityId !== null && KINDS_MOTIVO_PERDIDA.includes(e.kind))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const e of ordenadas) out.set(e.opportunityId as number, aMotivo(e));
  return out;
}

// Motivo de cada cambio de etapa a «Perdida»: el registro de la misma oportunidad más cercano en el
// tiempo, sin usar el mismo dos veces (una oportunidad reabierta y perdida otra vez tiene dos).
export function motivoPorCambioDeEtapa(
  cambios: { id: number; opportunityId: number; toStatus: string; createdAt: Date }[],
  entradas: EntradaMotivoPerdida[],
): Map<number, MotivoPerdida> {
  const out = new Map<number, MotivoPerdida>();
  const usadas = new Set<EntradaMotivoPerdida>();
  const aPerdida = cambios
    .filter((c) => c.toStatus === ETAPA_PERDIDA)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const c of aPerdida) {
    let mejor: EntradaMotivoPerdida | null = null;
    let distancia = Infinity;
    for (const e of entradas) {
      if (e.opportunityId !== c.opportunityId || !KINDS_MOTIVO_PERDIDA.includes(e.kind) || usadas.has(e)) continue;
      const d = Math.abs(e.createdAt.getTime() - c.createdAt.getTime());
      if (d < distancia) {
        mejor = e;
        distancia = d;
      }
    }
    if (mejor) {
      usadas.add(mejor);
      out.set(c.id, aMotivo(mejor));
    }
  }
  return out;
}
