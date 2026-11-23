/**
 * Reglas para precargar las «Condiciones generales» del Cotizador desde la
 * configuración por pilar (2026-11-23).
 */

/**
 * De los pilares de los servicios de una oportunidad, solo se preselecciona
 * automáticamente cuando hay UNO solo. Con dos o tres, o con ninguno, la persona
 * elige en el selector.
 */
export function pilarUnicoDeOportunidad(pilares: string[] | undefined): string | null {
  const unicos = [...new Set((pilares ?? []).filter((p) => Boolean(p) && p !== 'SIN_PILAR'))];
  return unicos.length === 1 ? unicos[0] : null;
}

/**
 * ¿Hay que preguntar antes de reemplazar el texto de condiciones?
 * Se rellena sin preguntar si el campo está vacío o sigue siendo el texto que
 * pusimos automáticamente (o el texto de fábrica de siempre). Si la persona lo
 * editó, se pregunta.
 */
export function debePreguntarReemplazo(
  actual: string,
  textoAutomaticoAnterior: string | null,
  textoDeFabrica: string,
): boolean {
  const value = (actual ?? '').trim();
  if (!value) return false;
  return (
    value !== (textoAutomaticoAnterior ?? '').trim() &&
    value !== textoDeFabrica.trim()
  );
}
