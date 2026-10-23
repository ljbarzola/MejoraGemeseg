// ¿Esta oportunidad cuenta como «Referido»? Es la misma regla que usa la lista de Oportunidades en su columna y
// filtro de Origen (frontend `origenDeOportunidad`): una renovación, una ya-era-cliente o una migrada del sistema
// anterior tienen su propio origen (o «Ingreso manual») aunque su fuente guardada diga REFERIDO. El Dashboard cuenta
// con esta función para que su tarjeta «Referidos» dé el mismo número que la lista a la que lleva su botón.
const ORIGENES_QUE_NO_SON_REFERIDO = ['RENOVACION', 'HISTORICO', 'MIGRADA'];

export function esOrigenReferido(o: { source: string | null; originType: string }): boolean {
  return o.source === 'REFERIDO' && !ORIGENES_QUE_NO_SON_REFERIDO.includes(o.originType);
}
