// Tipos del Cotizador de Ventas y CRM (lo que devuelve y recibe /ventas/cotizador/*).

export type CotKind = 'EQUIPO' | 'MATERIAL' | 'SERVICIO';

/** Producto del catálogo. El `code` (EQ-0001...) lo asigna el servidor y no cambia nunca. */
export interface CotProduct {
  id: number;
  kind: CotKind;
  code: string;
  category: string;
  subcategory: string;
  model: string;
  name: string;
  description: string;
  unit: string;
  defaultQty: number;
  unitCost: number;
  monthlyCost: number;
  annualCost: number;
  hasProfit: boolean;
  hasInstall: boolean;
  supplier: string;
  lastUpdate: string | null;
  notes: string;
  isActive: boolean;
}

export interface CotInstall {
  id: number;
  code: string;
  category: string;
  subcategory: string;
  name: string;
  unitCost: number;
  notes: string;
  isActive: boolean;
}

/** Precio con el que se cotizó un producto: la cotización lo conserva aunque el catálogo cambie. */
export interface CotSnap {
  cost: number;
  hasGanancia: boolean;
  hasInstalacion: boolean;
  isService: boolean;
  supplier: string;
}

export interface CotProductLine {
  code: string;
  qty: number;
  installActive: boolean;
  techCost: number;
  customMargin: number | null;
  snap?: CotSnap;
  /** Solo líneas importadas del cotizador antiguo que se guardaron por posición y no por código. */
  legacyPosition?: number;
}

export interface CotKitLine {
  isKit: true;
  kitName: string;
  qty: number;
  kitComponents: CotProductLine[];
}

export interface CotInstallLine {
  isInstallService: true;
  id: string;
  description: string;
  category: string;
  subcategory: string;
  cost: number;
  qty: number;
  customCost: number | null;
  customMargin: number | null;
}

export type CotLine = CotProductLine | CotKitLine | CotInstallLine;

export const isKitLine = (l: CotLine): l is CotKitLine => 'isKit' in l && l.isKit === true;
export const isInstallLine = (l: CotLine): l is CotInstallLine =>
  'isInstallService' in l && l.isInstallService === true;
export const isProductLine = (l: CotLine): l is CotProductLine => !isKitLine(l) && !isInstallLine(l);

export type DiscountType = 'none' | 'percent' | 'fixed';

export type CotStatus = 'borrador' | 'enviada' | 'vista' | 'aceptada' | 'rechazada' | 'vencida';

export const COT_STATUS_ORDER: CotStatus[] = [
  'borrador',
  'enviada',
  'vista',
  'aceptada',
  'rechazada',
  'vencida',
];

export const COT_STATUS_LABEL: Record<CotStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  vista: 'Vista',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
};

export const COT_STATUS_COLOR: Record<CotStatus, string> = {
  borrador: '#718096',
  enviada: '#2b6cb0',
  vista: '#805ad5',
  aceptada: '#2f855a',
  rechazada: '#c53030',
  vencida: '#b7791f',
};

export interface CotClientData {
  name: string;
  ruc: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
}

export const EMPTY_CLIENT: CotClientData = {
  name: '',
  ruc: '',
  address: '',
  contact: '',
  phone: '',
  email: '',
};

/** Cómo ve el usuario una cotización: dueño, edición total, compartida o administrador (solo lectura). */
export type CotQuoteAccess = 'owner' | 'editor' | 'shared' | 'admin';

export interface CotQuote {
  id: number;
  quoteNumber: string;
  quoteDate: string;
  ownerId: number;
  ownerName: string;
  /** Teléfono actual del dueño (encabezado del PDF); null si no tiene. */
  ownerPhone: string | null;
  vendorName: string;
  client: CotClientData;
  items: CotLine[];
  status: CotStatus;
  installMargin: number;
  supplierMargins: Record<string, number>;
  discountType: DiscountType;
  discountValue: number;
  conditions: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  access: CotQuoteAccess | null;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

export interface CotKitComponent {
  code: string;
  qty: number;
  included: boolean;
}

export interface CotKit {
  id: number;
  name: string;
  components: CotKitComponent[];
  createdBy: number | null;
  createdAt: string;
}

export interface CotTemplate {
  id: number;
  name: string;
  description: string;
  clientType: string;
  industry: string;
  client: Partial<CotClientData>;
  items: CotLine[];
  supplierMargins: Record<string, number>;
  installMargin: number;
  isSample: boolean;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CotShareUser {
  userId: number;
  fullName: string;
  createdAt?: string;
}

export interface CotUserOption {
  id: number;
  fullName: string;
  position: string | null;
}
