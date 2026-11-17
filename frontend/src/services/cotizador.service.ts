import { api } from './auth.service';
import type { CotLimites } from '../utils/cotizador/alertas';
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

// ---------- Límites de precio (avisos) ----------

export const getCotLimites = (): Promise<CotLimites> =>
  api.get('/ventas/cotizador/limites').then(r => r.data);

/** Solo administradores y gerentes. null = sin límite. */
export const saveCotLimites = (data: CotLimites): Promise<CotLimites> =>
  api.put('/ventas/cotizador/limites', data).then(r => r.data);

// ---------- Historial de cambios del catálogo ----------

export interface CotCambio {
  id: number;
  creadoEn: string;
  entidad: 'PRODUCTO' | 'INSTALACION';
  codigo: string;
  nombre: string;
  accion: 'CREO' | 'EDITO' | 'ELIMINO';
  campo: string;
  campoEtiqueta: string;
  campoTipo: 'dinero' | 'numero' | 'si_no' | 'texto';
  esPrecio: boolean;
  valorAntes: string | null;
  valorDespues: string | null;
  userId: number | null;
  userNombre: string;
}

export interface CotHistorialFiltro {
  q?: string;
  /** precio | datos | creo | elimino */
  tipo?: string;
  desde?: string;
  hasta?: string;
  userId?: number;
  pagina?: number;
  limite?: number;
}

export const getCotHistorial = (
  filtro: CotHistorialFiltro,
): Promise<{ total: number; pagina: number; limite: number; items: CotCambio[] }> =>
  api.get('/ventas/cotizador/historial', { params: filtro }).then(r => r.data);

export const getCotHistorialPersonas = (): Promise<{ userId: number; nombre: string }[]> =>
  api.get('/ventas/cotizador/historial/personas').then(r => r.data);

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
  /** Precio mínimo de venta antes de IVA; null lo quita. Solo lo acepta el servidor de administradores y gerentes. */
  minPrice?: number | null;
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

// ---------- Enlace para el cliente (2026-11-17) ----------

export interface CotEnlaceSeguimiento {
  /** Puede crear o desactivar el enlace (dueño o edición total). */
  puedeGestionar: boolean;
  enlace: { token: string; creadoEn: string; creadoPor: string } | null;
  huboEnlaces: number;
  resumen: {
    aperturas: number;
    personas: number;
    segundos: number;
    descargas: number;
    primeraVista: string | null;
    ultimaVista: string | null;
    celular: number;
    computadora: number;
    tablet: number;
    /** Aperturas del propio equipo (no cuentan). */
    internas: number;
  };
  visitas: { inicio: string; segundos: number; dispositivo: string; descargoPdf: boolean }[];
  respuestas: { tipo: 'interesa' | 'dudas'; mensaje: string; creadoEn: string }[];
}

export const getCotEnlace = (id: number): Promise<CotEnlaceSeguimiento> =>
  api.get(`/ventas/cotizador/cotizaciones/${id}/enlace`).then(r => r.data);

export const crearCotEnlace = (id: number): Promise<CotEnlaceSeguimiento> =>
  api.post(`/ventas/cotizador/cotizaciones/${id}/enlace`).then(r => r.data);

export const desactivarCotEnlace = (id: number): Promise<CotEnlaceSeguimiento> =>
  api.delete(`/ventas/cotizador/cotizaciones/${id}/enlace`).then(r => r.data);

/** Dirección pública que se le manda al cliente. */
export const urlCotizacionPublica = (token: string): string =>
  `${window.location.origin}/cotizacion/${token}`;

// ---------------------------------------------------------------------------
// Cotización ↔ oportunidad (2026-11-17)
// ---------------------------------------------------------------------------

/** Una oportunidad en el selector «Oportunidad» del Cotizador. */
export interface CotOportunidadOpcion {
  id: number;
  titulo: string;
  etapa: string;
  abierta: boolean;
  monto: number | null;
  llegada: string;
  responsable: string;
  cliente: { id: number; nombre: string; ruc: string; direccion: string; telefono: string; email: string };
}

export interface CotDeOportunidad {
  oportunidad: CotOportunidadOpcion | null;
  principal: boolean;
  /** Total (con IVA) de esta cotización calculado en el servidor; null si no está unida. */
  total: number | null;
  /** Monto cotizado que tiene hoy la oportunidad. */
  montoOportunidad: number | null;
  /** La cotización principal de la oportunidad cuando NO es esta. */
  principalActual: { id: number; quoteNumber: string; total: number } | null;
}

/** Cotizaciones de una oportunidad (su ficha en Oportunidades). */
export interface CotizacionesDeOportunidad {
  montoOportunidad: number | null;
  cotizaciones: {
    id: number;
    quoteNumber: string;
    quoteDate: string;
    status: string;
    vendorName: string;
    total: number;
    principal: boolean;
    puedeAbrir: boolean;
  }[];
}

export const buscarCotOportunidades = (q: string): Promise<CotOportunidadOpcion[]> =>
  api.get('/ventas/cotizador/oportunidades', { params: { q } }).then(r => r.data);

export const getCotOportunidad = (id: number): Promise<CotOportunidadOpcion> =>
  api.get(`/ventas/cotizador/oportunidades/${id}`).then(r => r.data);

export const getCotQuoteOportunidad =(id: number): Promise<CotDeOportunidad> =>
  api.get(`/ventas/cotizador/cotizaciones/${id}/oportunidad`).then(r => r.data);

export const setCotQuoteOportunidad = (id: number, opportunityId: number | null): Promise<CotDeOportunidad> =>
  api.put(`/ventas/cotizador/cotizaciones/${id}/oportunidad`, { opportunityId }).then(r => r.data);

export const getCotizacionesDeOportunidad = (oppId: number): Promise<CotizacionesDeOportunidad> =>
  api.get(`/ventas/oportunidades/${oppId}/cotizaciones`).then(r => r.data);

export const marcarCotizacionPrincipal = (oppId: number, quoteId: number): Promise<CotizacionesDeOportunidad> =>
  api.post(`/ventas/oportunidades/${oppId}/cotizaciones/${quoteId}/principal`).then(r => r.data);
