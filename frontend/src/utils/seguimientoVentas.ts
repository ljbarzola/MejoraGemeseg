import type { SalesClient } from '../services/ventas.service';

// Seguimiento ("Hoy") de Ventas: compartido por Clientes y Oportunidades.

export type Urgencia = 'vencido' | 'hoy' | 'futuro' | 'sin';
export const URGENCIA_ORDEN: Record<Urgencia, number> = { vencido: 0, hoy: 1, sin: 2, futuro: 3 };
export const COLOR_VENCIDO = '#c53030';
export const COLOR_HOY = '#b7791f';

// Hoy en hora local como 'YYYY-MM-DD' (nextActionDate es solo día, ver
// SalesClient en ventas.service.ts: se compara como texto, no como Date).
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const diaDe = (c: SalesClient): string | null => (c.nextActionDate ? c.nextActionDate.slice(0, 10) : null);
export const formatDia = (iso: string) => iso.split('-').reverse().join('/');

export function urgenciaDe(c: SalesClient, hoy: string): Urgencia {
  const dia = diaDe(c);
  if (!dia) return 'sin';
  if (dia < hoy) return 'vencido';
  if (dia === hoy) return 'hoy';
  return 'futuro';
}

// Vencidos (el más atrasado primero), hoy, sin fecha; luego por nombre.
export function ordenarPorUrgencia(clientes: SalesClient[], hoy: string): SalesClient[] {
  return [...clientes].sort((a, b) => {
    const ua = URGENCIA_ORDEN[urgenciaDe(a, hoy)];
    const ub = URGENCIA_ORDEN[urgenciaDe(b, hoy)];
    if (ua !== ub) return ua - ub;
    const da = diaDe(a) || '';
    const db = diaDe(b) || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });
}
