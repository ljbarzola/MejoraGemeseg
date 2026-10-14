// Etapas "ganada" y "perdida" por clave. Decisión de Ventas: en producción
// siempre existen ACEPTADO y RECHAZADO como etapas finales (las claves de etapa
// nunca cambian aunque se renombre la etiqueta). Antes estaban repetidas dentro
// de ventas-clientes.service.ts; ahora las comparten clientes y oportunidades.
export const ETAPA_GANADA = 'ACEPTADO';
export const ETAPA_PERDIDA = 'RECHAZADO';

export type ResultadoOportunidad = 'GANADA' | 'PERDIDA';

// Resultado de una oportunidad que acaba de entrar a una etapa. Una etapa final
// con otra clave (una empresa que creó la suya) cierra la oportunidad pero no
// la cuenta como ganada ni perdida: se devuelve null y `cerrada` lo distingue.
export function resultadoDeEtapa(
  key: string | null | undefined,
  isFinal: boolean,
): { outcome: ResultadoOportunidad | null; cerrada: boolean } {
  if (key === ETAPA_GANADA) return { outcome: 'GANADA', cerrada: true };
  if (key === ETAPA_PERDIDA) return { outcome: 'PERDIDA', cerrada: true };
  return { outcome: null, cerrada: isFinal };
}
