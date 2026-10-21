// Datos de contacto que un posible cliente trae y que, al pasar a oportunidad, deben llegar a la ficha de
// la empresa o persona (2026-10-18). Antes la dirección ni se guardaba: ni el formulario web ni «Nuevo
// posible cliente» la pedían, así que la ficha nacía sin ella.

const MAX_DIRECCION = 300;

const limpiar = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// «Av. Amazonas 123» + «Quito» → «Av. Amazonas 123, Quito». Si la ciudad ya viene dentro de la dirección no se
// repite. null si no hay ninguna de las dos.
export function combinarDireccion(direccion?: unknown, ciudad?: unknown): string | null {
  const d = limpiar(direccion);
  const c = limpiar(ciudad);
  if (!d && !c) return null;
  if (!c) return d.slice(0, MAX_DIRECCION);
  if (!d) return c.slice(0, MAX_DIRECCION);
  if (d.toLowerCase().includes(c.toLowerCase())) return d.slice(0, MAX_DIRECCION);
  return `${d}, ${c}`.slice(0, MAX_DIRECCION);
}

// La dirección guardada en los datos extra de un posible cliente (`extra.direccion`), o null.
export function direccionDeLead(extra: unknown): string | null {
  const v = (extra as Record<string, unknown> | null | undefined)?.['direccion'];
  const t = limpiar(v);
  return t ? t.slice(0, MAX_DIRECCION) : null;
}
