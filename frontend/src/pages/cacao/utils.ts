export function formatDateEc(date: string | Date): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatKg(n: number): string {
  return n.toLocaleString('es-EC', { minimumFractionDigits: 0 }) + ' kg';
}

/**
 * Texto de error para mostrar al usuario. Los mensajes propios del servidor ya vienen en
 * español y cortos; el validador de Nest devuelve listas y frases técnicas en inglés
 * ("lots.0.quantity must be..."), que no se muestran tal cual.
 */
export function apiErrorMessage(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  const text = Array.isArray(raw) ? raw.join('. ') : typeof raw === 'string' ? raw : '';
  if (!text || /\bmust\b|should not exist|should not be empty/i.test(text)) return fallback;
  return text;
}

export interface EstadoVisual {
  label: string;
  bg: string;
  color: string;
}

/** Estados de una liquidación: PENDING (por aprobar) → APPROVED → PAID; REJECTED y CANCELLED. */
export function estadoLiquidacion(status: string): EstadoVisual {
  switch (status) {
    case 'APPROVED': return { label: 'Aprobada', bg: '#bee3f8', color: '#2b6cb0' };
    case 'PAID': return { label: 'Pagada', bg: '#c6f6d5', color: '#276749' };
    case 'REJECTED': return { label: 'Rechazada', bg: '#fed7d7', color: '#9b2c2c' };
    case 'CANCELLED': return { label: 'Anulada', bg: '#e2e8f0', color: '#4a5568' };
    default: return { label: 'Por aprobar', bg: '#fefcbf', color: '#975a16' };
  }
}

/** Estados de una cuenta por pagar o por cobrar. */
export function estadoCuenta(status: string): EstadoVisual {
  switch (status) {
    case 'PAID':
    case 'RECEIVED': return { label: status === 'PAID' ? 'Pagada' : 'Cobrada', bg: '#c6f6d5', color: '#276749' };
    case 'PARTIAL': return { label: 'Parcial', bg: '#fefcbf', color: '#975a16' };
    case 'CANCELLED': return { label: 'Anulada', bg: '#e2e8f0', color: '#4a5568' };
    default: return { label: 'Pendiente', bg: '#fed7d7', color: '#9b2c2c' };
  }
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  CHECK: 'Cheque',
};
