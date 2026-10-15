// Borrador de la cotización en pantalla: su forma, sus valores por defecto y su guardado automático en el
// navegador (para no perder el trabajo si se cierra la pestaña), como hacía el cotizador original.
import type { CotClientData, CotLine, CotQuote, CotQuoteAccess, CotStatus, DiscountType } from './types';
import { EMPTY_CLIENT } from './types';
import { DEFAULT_INSTALL_MARGIN } from './pricing';
import { todayISO } from './format';

export const DEFAULT_CONDITIONS =
  'Validez de la oferta: 15 días calendario desde la fecha de emisión.\n' +
  'Forma de pago: 50% anticipo, 50% contra entrega (configurable según monto).\n' +
  'Plazo de entrega: Por confirmar al momento de la orden.\n' +
  'Garantía equipos: 12 a 24 meses según fabricante.\n' +
  'Garantía mano de obra: 90 días.\n' +
  'IVA: 15% incluido en el total.\n' +
  'Moneda: Dólares de los Estados Unidos (USD).';

export interface QuoteDraft {
  /** Id de la cotización guardada que se está editando; null = cotización nueva. */
  quoteId: number | null;
  /** Cómo la ve el usuario (dueño, edición total, compartida...). null si es nueva. */
  access: CotQuoteAccess | null;
  /** Dueño original (se imprime como quien emite la cotización). */
  ownerName: string;
  /** Teléfono del dueño (de la cotización guardada); vacío si no tiene o si es una cotización nueva. */
  ownerPhone: string;
  status: CotStatus;
  quoteNumber: string;
  /** El número mostrado es solo una sugerencia: el servidor asigna el definitivo al guardar. */
  numberIsTentative: boolean;
  quoteDate: string;
  client: CotClientData;
  items: CotLine[];
  supplierMargins: Record<string, number>;
  installMargin: number;
  discountType: DiscountType;
  discountValue: number;
  conditions: string;
  notes: string;
}

export function emptyDraft(): QuoteDraft {
  return {
    quoteId: null,
    access: null,
    ownerName: '',
    ownerPhone: '',
    status: 'borrador',
    quoteNumber: '',
    numberIsTentative: true,
    quoteDate: todayISO(),
    client: { ...EMPTY_CLIENT },
    items: [],
    supplierMargins: {},
    installMargin: DEFAULT_INSTALL_MARGIN,
    discountType: 'none',
    discountValue: 0,
    conditions: DEFAULT_CONDITIONS,
    notes: '',
  };
}

export function draftFromQuote(q: CotQuote): QuoteDraft {
  return {
    quoteId: q.id,
    access: q.access,
    ownerName: q.vendorName || q.ownerName,
    ownerPhone: q.ownerPhone ?? '',
    status: q.status,
    quoteNumber: q.quoteNumber,
    numberIsTentative: false,
    quoteDate: q.quoteDate,
    client: { ...EMPTY_CLIENT, ...q.client },
    items: q.items,
    supplierMargins: q.supplierMargins ?? {},
    installMargin: q.installMargin,
    discountType: q.discountType,
    discountValue: q.discountValue,
    conditions: q.conditions,
    notes: q.notes,
  };
}

const KEY = (userId: number) => `cotizador:borrador:${userId}`;

export function saveDraftLocal(userId: number, draft: QuoteDraft): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(draft));
  } catch {
    /* sin almacenamiento: no pasa nada, solo no se recuerda el borrador */
  }
}

export function loadDraftLocal(userId: number): QuoteDraft | null {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<QuoteDraft>;
    if (!d || !Array.isArray(d.items)) return null;
    return { ...emptyDraft(), ...d, client: { ...EMPTY_CLIENT, ...(d.client ?? {}) } } as QuoteDraft;
  } catch {
    return null;
  }
}

export function clearDraftLocal(userId: number): void {
  try {
    localStorage.removeItem(KEY(userId));
  } catch {
    /* nada */
  }
}

/** ¿El borrador tiene algo que valga la pena conservar? */
export function draftHasContent(d: QuoteDraft): boolean {
  return (
    d.items.length > 0 ||
    Object.values(d.client).some((v) => String(v).trim() !== '') ||
    d.notes.trim() !== ''
  );
}
