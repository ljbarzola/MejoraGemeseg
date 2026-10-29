// Filtro «Fecha» de las listas de Ventas y periodo del Dashboard: un solo criterio para los dos,
// así el número de una tarjeta y la lista a la que lleva su botón cuentan lo mismo.
//
// Los días son los de Ecuador (UTC-5 todo el año): un posible cliente que llega a las 20:00 de
// Guayaquil ya es «mañana» en UTC y no debe contarse en otro día. El servidor usa la misma regla.

export type AtajoFecha = '' | 'hoy' | 'semana' | 'mes' | 'mes_pasado' | '90' | 'anio' | 'personalizado';

export interface FiltroFechaValor {
  atajo: AtajoFecha;
  desde: string; // 'YYYY-MM-DD' o ''
  hasta: string;
}

export const FILTRO_FECHA_VACIO: FiltroFechaValor = { atajo: '', desde: '', hasta: '' };

export const ATAJOS_FECHA: { value: Exclude<AtajoFecha, '' | 'personalizado'>; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'anio', label: 'Este año' },
];

const HORAS_ECUADOR = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

const aISO = (d: Date) => d.toISOString().slice(0, 10);
const diaUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** El día de Ecuador ('YYYY-MM-DD') de un instante (o de «ahora»). */
export const diaEcuador = (v: string | Date = new Date()): string =>
  aISO(new Date(new Date(v).getTime() - HORAS_ECUADOR));

/** 'dd/mm/aaaa' del día de Ecuador de un instante: lo que muestran las columnas «Llegó», igual que el filtro. */
export const diaCortoEcuador = (v?: string | null): string => {
  if (!v) return '';
  const [y, m, d] = diaEcuador(v).split('-');
  return `${d}/${m}/${y}`;
};

/** Desde/hasta de un atajo, contado desde el día de Ecuador `hoy`. */
export function rangoDeAtajo(
  atajo: Exclude<AtajoFecha, '' | 'personalizado'>,
  hoy: string = diaEcuador(),
): { desde: string; hasta: string } {
  const h = diaUtc(hoy);
  if (atajo === 'hoy') return { desde: hoy, hasta: hoy };
  if (atajo === 'semana') {
    const lunes = new Date(h.getTime() - ((h.getUTCDay() + 6) % 7) * DIA_MS);
    return { desde: aISO(lunes), hasta: hoy };
  }
  if (atajo === 'mes_pasado') {
    return {
      desde: aISO(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1))),
      hasta: aISO(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0))),
    };
  }
  if (atajo === '90') return { desde: aISO(new Date(h.getTime() - 89 * DIA_MS)), hasta: hoy };
  if (atajo === 'anio') return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}

/** Si un desde/hasta coincide con un atajo, cuál (así «Este mes» se lee como «Este mes» y no como fechas sueltas). */
export function atajoDeRango(desde: string, hasta: string): AtajoFecha {
  for (const a of ATAJOS_FECHA) {
    const r = rangoDeAtajo(a.value);
    if (r.desde === desde && r.hasta === hasta) return a.value;
  }
  return 'personalizado';
}

export const hayFiltroFecha = (f: FiltroFechaValor) => !!(f.desde || f.hasta);

/**
 * ¿Cae `valor` dentro del filtro? Sin filtro, todo cae. Un dato sin fecha no cae cuando hay filtro.
 * `soloDia`: la fecha ya es un día sin hora (inicio de un contrato); no se corre por zona horaria.
 */
export function fechaEnRango(valor: string | null | undefined, f: FiltroFechaValor, soloDia = false): boolean {
  if (!hayFiltroFecha(f)) return true;
  if (!valor) return false;
  const dia = soloDia ? valor.slice(0, 10) : diaEcuador(valor);
  if (f.desde && dia < f.desde) return false;
  if (f.hasta && dia > f.hasta) return false;
  return true;
}

const esDia = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lee ?desde=&hasta= de la URL (lo manda el Dashboard) y lo convierte en un filtro, o null si no vienen. */
export function filtroFechaDeUrl(desde: string | null, hasta: string | null): FiltroFechaValor | null {
  if (!esDia(desde) && !esDia(hasta)) return null;
  const d = esDia(desde) ? desde! : '';
  const h = esDia(hasta) ? hasta! : '';
  return { atajo: d && h ? atajoDeRango(d, h) : 'personalizado', desde: d, hasta: h };
}
