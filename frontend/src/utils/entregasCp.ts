// Textos, colores y ayudas compartidas por las pantallas de entregas de
// Contratación Pública (detalle de entidad, bandejas, panel de revisión).
import type { CPEstadoEntrega } from '../types/contratacion-publica';
import { MESES_ES } from '../types/contratacion-publica';

export const ESTADO_LABEL: Record<CPEstadoEntrega, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

export const ESTADO_COLOR: Record<CPEstadoEntrega, { bg: string; fg: string }> = {
  PENDIENTE: { bg: '#fefcbf', fg: '#744210' },
  ENTREGADO: { bg: '#bee3f8', fg: '#2a4365' },
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
};

export const ARCHIVOS_ACEPTADOS = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip';

/** Mensaje del servidor si lo hay; si no, el de respaldo (nunca el error crudo). */
export const mensajeError = (err: any, fallback: string): string => {
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(' ');
  return typeof m === 'string' && m ? m : fallback;
};

/** 'AAAA-MM-DD' (o ISO) → 'DD/MM/AAAA'. */
export const formatoFecha = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const tituloMes = (anio: number, mes: number) => `${MESES_ES[mes - 1]} de ${anio}`;
