import { api } from './auth.service';
import type {
  CotClientData,
  CotInstall,
  CotKind,
  CotKit,
  CotKitComponent,
  CotLine,
  CotProduct,
  CotQuote,
  CotShareUser,
  CotStatus,
  CotTemplate,
  CotUserOption,
  DiscountType,
} from '../utils/cotizador/types';

// Cliente del API del Cotizador (/ventas/cotizador/*). Los errores se manejan en la pantalla.

// ---------- Catálogo ----------

export interface CotCatalogo {
  productos: CotProduct[];
  instalaciones: CotInstall[];
}

export const getCotCatalogo = (incluirInactivos = false): Promise<CotCatalogo> =>
  api.get('/ventas/cotizador/catalogo', { params: { incluirInactivos } }).then(r => r.data);

export interface CotProductInput {
  kind?: CotKind; // solo al crear
  name: string;
  category?: string;
  subcategory?: string;
  model?: string;
  description?: string;
  unit?: string;
  supplier?: string;
  lastUpdate?: string;
  notes?: string;
  defaultQty?: number;
  unitCost?: number;
  monthlyCost?: number;
  annualCost?: number;
  hasProfit?: boolean;
  hasInstall?: boolean;
}

export const createCotProduct = (data: CotProductInput & { kind: CotKind }): Promise<CotProduct> =>
  api.post('/ventas/cotizador/productos', data).then(r => r.data);

export const updateCotProduct = (id: number, data: Partial<CotProductInput>): Promise<CotProduct> =>
  api.patch(`/ventas/cotizador/productos/${id}`, data).then(r => r.data);

// "Eliminar" desactiva el producto: las cotizaciones que lo usaron no se tocan.
export const deleteCotProduct = (id: number) =>
  api.delete(`/ventas/cotizador/productos/${id}`).then(r => r.data);

export interface CotInstallInput {
  name: string;
  category?: string;
  subcategory?: string;
  notes?: string;
  unitCost?: number;
}

export const createCotInstall = (data: CotInstallInput): Promise<CotInstall> =>
  api.post('/ventas/cotizador/instalaciones', data).then(r => r.data);

export const updateCotInstall = (id: number, data: Partial<CotInstallInput>): Promise<CotInstall> =>
  api.patch(`/ventas/cotizador/instalaciones/${id}`, data).then(r => r.data);

export const deleteCotInstall = (id: number) =>
  api.delete(`/ventas/cotizador/instalaciones/${id}`).then(r => r.data);

export type CotCodeType = 'EQUIPO' | 'MATERIAL' | 'SERVICIO' | 'INSTALACION';

/** El código que recibiría la próxima alta (solo para mostrarlo; no lo gasta). */
export const getCotNextCode = (tipo: CotCodeType): Promise<{ code: string }> =>
  api.get('/ventas/cotizador/siguiente-codigo', { params: { tipo } }).then(r => r.data);

// ---------- Kits ----------

export const getCotKits = (): Promise<CotKit[]> => api.get('/ventas/cotizador/kits').then(r => r.data);

export const createCotKit = (data: { name: string; components: CotKitComponent[] }): Promise<CotKit> =>
  api.post('/ventas/cotizador/kits', data).then(r => r.data);

export const updateCotKit = (
  id: number,
  data: { name?: string; components?: CotKitComponent[] },
): Promise<CotKit> => api.patch(`/ventas/cotizador/kits/${id}`, data).then(r => r.data);

export const deleteCotKit = (id: number) => api.delete(`/ventas/cotizador/kits/${id}`).then(r => r.data);

// ---------- Plantillas ----------

export interface CotTemplateInput {
  name: string;
  description?: string;
  clientType?: string;
  industry?: string;
  client?: Partial<CotClientData>;
  items?: CotLine[];
  supplierMargins?: Record<string, number>;
  installMargin?: number;
  isSample?: boolean;
}

export const getCotTemplates = (): Promise<CotTemplate[]> =>
  api.get('/ventas/cotizador/plantillas').then(r => r.data);

export const createCotTemplate = (data: CotTemplateInput): Promise<CotTemplate> =>
  api.post('/ventas/cotizador/plantillas', data).then(r => r.data);

export const updateCotTemplate = (id: number, data: Partial<CotTemplateInput>): Promise<CotTemplate> =>
  api.patch(`/ventas/cotizador/plantillas/${id}`, data).then(r => r.data);

export const deleteCotTemplate = (id: number) =>
  api.delete(`/ventas/cotizador/plantillas/${id}`).then(r => r.data);

// ---------- Cotizaciones ----------

export interface CotQuoteInput {
  quoteNumber?: string;
  quoteDate?: string;
  client: CotClientData;
  items: CotLine[];
  status?: CotStatus;
  installMargin: number;
  supplierMargins: Record<string, number>;
  discountType: DiscountType;
  discountValue: number;
  conditions: string;
  notes: string;
}

export const getCotQuotes = (): Promise<CotQuote[]> =>
  api.get('/ventas/cotizador/cotizaciones').then(r => r.data);

export const getCotQuote = (id: number): Promise<CotQuote> =>
  api.get(`/ventas/cotizador/cotizaciones/${id}`).then(r => r.data);

/** El número que recibiría la próxima cotización (solo para mostrarlo; no lo gasta). */
export const getCotNextNumber = (fecha?: string): Promise<{ quoteNumber: string }> =>
  api.get('/ventas/cotizador/cotizaciones/siguiente-numero', { params: { fecha } }).then(r => r.data);

/** ¿Ya existe una cotización con ese número? Devuelve su id solo si puedes editarla. */
export const checkCotQuoteNumber = (
  numero: string,
  excluirId?: number,
): Promise<{ existe: boolean; existingId: number | null }> =>
  api
    .get('/ventas/cotizador/cotizaciones/verificar-numero', { params: { numero, excluir: excluirId } })
    .then(r => r.data);

export const createCotQuote = (data: CotQuoteInput): Promise<CotQuote> =>
  api.post('/ventas/cotizador/cotizaciones', data).then(r => r.data);

export const updateCotQuote = (id: number, data: Partial<CotQuoteInput>): Promise<CotQuote> =>
  api.patch(`/ventas/cotizador/cotizaciones/${id}`, data).then(r => r.data);

export const changeCotQuoteStatus = (id: number, status: CotStatus): Promise<CotQuote> =>
  api.patch(`/ventas/cotizador/cotizaciones/${id}/estado`, { status }).then(r => r.data);

export const deleteCotQuote = (id: number) =>
  api.delete(`/ventas/cotizador/cotizaciones/${id}`).then(r => r.data);

/** Copia propia de una cotización que el usuario ve (p. ej. una que le compartieron). */
export const copyCotQuote = (id: number): Promise<CotQuote> =>
  api.post(`/ventas/cotizador/cotizaciones/${id}/copiar`).then(r => r.data);

// ---------- Compartir ----------

export const getCotUsers = (): Promise<CotUserOption[]> =>
  api.get('/ventas/cotizador/usuarios').then(r => r.data);

export const getCotQuoteShares = (id: number): Promise<CotShareUser[]> =>
  api.get(`/ventas/cotizador/cotizaciones/${id}/compartidos`).then(r => r.data);

export const shareCotQuote = (id: number, userId: number): Promise<CotShareUser> =>
  api.post(`/ventas/cotizador/cotizaciones/${id}/compartir`, { userId }).then(r => r.data);

export const unshareCotQuote = (id: number, userId: number) =>
  api.delete(`/ventas/cotizador/cotizaciones/${id}/compartir/${userId}`).then(r => r.data);

export interface CotEditAccess {
  otorgados: CotShareUser[];
  recibidos: CotShareUser[];
}

export const getCotEditAccess = (): Promise<CotEditAccess> =>
  api.get('/ventas/cotizador/accesos-edicion').then(r => r.data);

export const grantCotEditAccess = (userId: number): Promise<CotShareUser> =>
  api.post('/ventas/cotizador/accesos-edicion', { userId }).then(r => r.data);

export const revokeCotEditAccess = (userId: number) =>
  api.delete(`/ventas/cotizador/accesos-edicion/${userId}`).then(r => r.data);
