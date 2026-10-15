// Formato de dinero y fechas del Cotizador.

/** $1,234.56 — igual que el cotizador original. */
export function money(n: number | null | undefined): string {
  return '$' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 2026-10-15 -> 15/10/2026 */
export function isoToDMY(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/** Hoy en Ecuador (AAAA-MM-DD). */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Texto de una línea "Etiqueta: valor" -> { etiqueta, valor } para ponerla en negrita al imprimir. */
export function splitConditionLine(line: string): { label: string; value: string } | null {
  const m = line.match(/^([^:]+):\s*(.+)/);
  return m ? { label: m[1], value: m[2] } : null;
}

/** Mensaje de error del API (o uno por defecto) para mostrarlo al usuario sin detalles técnicos. */
export function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  const first = Array.isArray(msg) ? msg[0] : msg;
  return first || fallback;
}
