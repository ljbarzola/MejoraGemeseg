// Cuándo llegó de verdad un lead que la web mandó con retraso (2026-10-20).
//
// El plugin de WordPress (GEMESEG CRM Sync) guarda cada lead en una cola y lo envía
// después. Si la cola se detiene unas horas o días, el lead llegaba al CRM con la fecha
// del envío y no con la de cuando la persona escribió. Si la web manda `recibidoEn`
// (fecha ISO, p. ej. «2026-10-19T17:11:35+00:00»), esa fecha manda; si falta o no sirve,
// se usa la de ahora. Nunca se rechaza un lead por esto: lo peor que pasa es que quede
// con la fecha del envío, como antes.

const MAX_ATRASO_DIAS = 90;
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000;

export function fechaDeRecepcion(valor: unknown, ahora: Date = new Date()): Date | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const fecha = new Date(valor.trim());
  if (Number.isNaN(fecha.getTime())) return null;
  // Del futuro (más allá de la diferencia normal entre relojes) no es creíble.
  if (fecha.getTime() > ahora.getTime() + TOLERANCIA_RELOJ_MS) return null;
  // Demasiado vieja: probablemente un error de la web, no un lead retenido.
  if (fecha.getTime() < ahora.getTime() - MAX_ATRASO_DIAS * 24 * 60 * 60 * 1000) return null;
  // Con el reloj de la web un poco adelantado, nunca queda en el futuro.
  return fecha.getTime() > ahora.getTime() ? ahora : fecha;
}
