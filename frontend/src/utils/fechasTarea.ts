/**
 * Validación de las fechas de una tarea: la de fin no puede ir antes que la de inicio.
 * Las fechas llegan como texto AAAA-MM-DD (lo que entrega DateInput), que se compara bien como texto.
 * Devuelve el mensaje a mostrar, o null si está bien (o si falta alguna de las dos).
 */
export function errorFechasTarea(inicio?: string | null, fin?: string | null): string | null {
  if (!inicio || !fin) return null;
  return fin < inicio ? 'La fecha fin no puede ser anterior a la fecha de inicio.' : null;
}
