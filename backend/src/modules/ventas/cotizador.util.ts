import { BadRequestException } from '@nestjs/common';
import type { CotInstallService, CotProduct, CotQuote } from '@prisma/client';

// Reglas puras del Cotizador (sin base de datos), para poder probarlas solas.

// ---------------------------------------------------------------------------
// Códigos de catálogo
// ---------------------------------------------------------------------------

export type CotCounterKind = 'EQUIPO' | 'MATERIAL' | 'SERVICIO' | 'INSTALACION';

export const COT_PREFIX: Record<CotCounterKind, string> = {
  EQUIPO: 'EQ-',
  MATERIAL: 'MT-',
  SERVICIO: 'SV-',
  INSTALACION: 'INST-',
};

/** EQ-0001, MT-0001, SV-0001 llevan 4 dígitos; INST-001, 3 (igual que en el cotizador original). */
export const codeWidth = (kind: CotCounterKind): number =>
  kind === 'INSTALACION' ? 3 : 4;

export function formatCode(kind: CotCounterKind, n: number): string {
  return COT_PREFIX[kind] + String(n).padStart(codeWidth(kind), '0');
}

/** Número de un código ("EQ-0017" -> 17) o null si no tiene el formato del tipo. */
export function parseCodeNumber(
  kind: CotCounterKind,
  code: string,
): number | null {
  const prefix = COT_PREFIX[kind];
  if (!code.startsWith(prefix)) return null;
  const rest = code.slice(prefix.length);
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}

// ---------------------------------------------------------------------------
// Número de cotización
// ---------------------------------------------------------------------------

/** COT-AAAAMMDD-NNNN. La secuencia NO se reinicia cada día. */
export function formatQuoteNumber(dateISO: string, seq: number): string {
  return `COT-${dateISO.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
}

/** Última parte numérica de un número de cotización ("COT-20261015-0308" -> 308). */
export function quoteSeqOf(quoteNumber: string): number | null {
  const m = /-(\d+)$/.exec(quoteNumber);
  return m ? parseInt(m[1], 10) : null;
}

/** Fecha de hoy (AAAA-MM-DD) en Ecuador, que es donde se emiten las cotizaciones. */
export function ecuadorToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// ---------------------------------------------------------------------------
// Visibilidad de una cotización (equivale a las reglas RLS del cotizador original)
// ---------------------------------------------------------------------------

/**
 * Cómo ve el usuario una cotización:
 *  - owner:  es suya. Ve, edita, cambia el estado, elimina y comparte.
 *  - editor: el dueño le dio "edición total". Ve, edita y cambia el estado; no elimina ni comparte.
 *  - shared: se la compartieron. Solo la ve y puede crear una copia.
 *  - admin:  administrador de la empresa. La ve (solo lectura) y puede crear una copia.
 */
export type CotQuoteAccess = 'owner' | 'editor' | 'shared' | 'admin';

export function resolveQuoteAccess(args: {
  userId: number;
  isAdmin: boolean;
  ownerId: number;
  sharedWith: number[];
  editorsOfOwner: number[];
}): CotQuoteAccess | null {
  if (args.userId === args.ownerId) return 'owner';
  if (args.editorsOfOwner.includes(args.userId)) return 'editor';
  if (args.sharedWith.includes(args.userId)) return 'shared';
  if (args.isAdmin) return 'admin';
  return null;
}

export const canEditQuote = (a: CotQuoteAccess | null): boolean =>
  a === 'owner' || a === 'editor';
export const canDeleteQuote = (a: CotQuoteAccess | null): boolean =>
  a === 'owner';
export const canShareQuote = (a: CotQuoteAccess | null): boolean =>
  a === 'owner';

// ---------------------------------------------------------------------------
// Datos JSON
// ---------------------------------------------------------------------------

/** Decimal de Prisma (o string/number) -> número. El API siempre devuelve números, no strings. */
export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // Decimal de Prisma (y strings): su toString() devuelve el número en texto
  const texto =
    typeof v === 'string'
      ? v
      : typeof v === 'object' &&
          'toString' in v &&
          typeof v.toString === 'function'
        ? (v as { toString(): string }).toString()
        : '';
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/** Evita guardar un JSON desmesurado (líneas de cotización, kits, plantillas). */
export function assertJsonSize(
  value: unknown,
  maxBytes: number,
  label: string,
) {
  const size = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  if (size > maxBytes) {
    throw new BadRequestException(
      `${label} es demasiado grande (${Math.round(size / 1024)} KB, máximo ${Math.round(maxBytes / 1024)} KB)`,
    );
  }
}

export const MAX_ITEMS_BYTES = 1_500_000;
export const MAX_CLIENT_BYTES = 20_000;

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export function mapProduct(p: CotProduct) {
  return {
    id: p.id,
    kind: p.kind,
    code: p.code,
    category: p.category,
    subcategory: p.subcategory,
    model: p.model,
    name: p.name,
    description: p.description,
    unit: p.unit,
    defaultQty: toNum(p.defaultQty),
    unitCost: toNum(p.unitCost),
    monthlyCost: toNum(p.monthlyCost),
    annualCost: toNum(p.annualCost),
    hasProfit: p.hasProfit,
    hasInstall: p.hasInstall,
    supplier: p.supplier,
    lastUpdate: p.lastUpdate,
    notes: p.notes,
    isActive: p.isActive,
  };
}

export function mapInstall(i: CotInstallService) {
  return {
    id: i.id,
    code: i.code,
    category: i.category,
    subcategory: i.subcategory,
    name: i.name,
    unitCost: toNum(i.unitCost),
    notes: i.notes,
    isActive: i.isActive,
  };
}

export function mapQuote(
  q: CotQuote,
  access: CotQuoteAccess | null,
  ownerName?: string,
  ownerPhone?: string | null,
) {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    quoteDate: q.quoteDate.toISOString().slice(0, 10),
    ownerId: q.ownerId,
    ownerName: ownerName ?? q.vendorName,
    // Teléfono ACTUAL del dueño (sale en el encabezado del PDF); null si no tiene.
    ownerPhone: ownerPhone ?? null,
    vendorName: q.vendorName,
    client: q.client,
    items: q.items,
    status: q.status,
    installMargin: toNum(q.installMargin),
    supplierMargins: q.supplierMargins,
    discountType: q.discountType,
    discountValue: toNum(q.discountValue),
    conditions: q.conditions,
    notes: q.notes,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    access,
    canEdit: canEditQuote(access),
    canDelete: canDeleteQuote(access),
    canShare: canShareQuote(access),
  };
}

// ---------------------------------------------------------------------------
// Líneas de una cotización / plantilla / kit (lista blanca de campos)
// ---------------------------------------------------------------------------

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
  /** Solo líneas importadas del cotizador antiguo que guardaron una posición y no un código. */
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

const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function numIn(
  v: unknown,
  { min = 0, max = 1_000_000_000, def = 0, label = 'valor' } = {},
): number {
  if (v === undefined || v === null || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    return bad(`${label} no válido`);
  return n;
}

function nullableNum(v: unknown, label: string, max = 1000): number | null {
  if (v === undefined || v === null || v === '') return null;
  return numIn(v, { max, label });
}

function str(v: unknown, max: number): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean')
    return String(v).slice(0, max);
  return '';
}

function cleanSnap(v: unknown): CotSnap | undefined {
  if (!isObj(v)) return undefined;
  return {
    cost: numIn(v.cost, { label: 'precio guardado' }),
    hasGanancia: !!v.hasGanancia,
    hasInstalacion: !!v.hasInstalacion,
    isService: !!v.isService,
    supplier: str(v.supplier, 200),
  };
}

function cleanProductLine(raw: unknown): CotProductLine {
  if (!isObj(raw)) return bad('Línea de producto no válida');
  const code = str(raw.code, 40).trim();
  const legacy =
    raw.legacyPosition === undefined || raw.legacyPosition === null
      ? undefined
      : Math.trunc(
          numIn(raw.legacyPosition, { max: 100_000, label: 'posición' }),
        );
  if (!code && legacy === undefined)
    return bad('Cada producto necesita su código');
  const line: CotProductLine = {
    code,
    qty: numIn(raw.qty, { def: 1, max: 1_000_000, label: 'cantidad' }),
    installActive: !!raw.installActive,
    techCost: numIn(raw.techCost, { max: 100_000_000, label: 'costo técnico' }),
    customMargin: nullableNum(raw.customMargin, 'margen'),
  };
  const snap = cleanSnap(raw.snap);
  if (snap) line.snap = snap;
  if (legacy !== undefined) line.legacyPosition = legacy;
  return line;
}

/**
 * Deja solo los campos conocidos de cada línea y valida sus tipos. Productos por
 * CÓDIGO (nunca por posición), kits con sus componentes y servicios de instalación
 * por valor. Lanza 400 si algo no cuadra.
 */
export function sanitizeLines(items: unknown): CotLine[] {
  if (!Array.isArray(items)) return bad('Las líneas deben ser una lista');
  if (items.length > 500) return bad('Demasiadas líneas (máximo 500)');
  return items.map((raw): CotLine => {
    if (!isObj(raw)) return bad('Línea no válida');
    if (raw.isInstallService) {
      return {
        isInstallService: true,
        id: str(raw.id, 40),
        description: str(raw.description, 500),
        category: str(raw.category, 200),
        subcategory: str(raw.subcategory, 200),
        cost: numIn(raw.cost, { label: 'costo del servicio' }),
        qty: numIn(raw.qty, { def: 1, max: 1_000_000, label: 'cantidad' }),
        customCost: nullableNum(raw.customCost, 'costo', 1_000_000_000),
        customMargin: nullableNum(raw.customMargin, 'margen'),
      };
    }
    if (raw.isKit) {
      const comps = Array.isArray(raw.kitComponents) ? raw.kitComponents : [];
      if (comps.length > 200)
        return bad('Un kit no puede tener más de 200 componentes');
      return {
        isKit: true,
        kitName: str(raw.kitName, 200) || 'Kit',
        qty: numIn(raw.qty, { def: 1, max: 1_000_000, label: 'cantidad' }),
        kitComponents: comps.map(cleanProductLine),
      };
    }
    return cleanProductLine(raw);
  });
}

/** Componentes de un kit del catálogo: [{ code, qty, included }]. */
export function sanitizeKitComponents(
  components: unknown,
): { code: string; qty: number; included: boolean }[] {
  if (!Array.isArray(components))
    return bad('Los componentes deben ser una lista');
  return components.map((c) => {
    if (!isObj(c)) return bad('Componente no válido');
    return {
      code: str(c.code, 40).trim(),
      qty: numIn(c.qty, { def: 1, max: 1_000_000, label: 'cantidad' }),
      included: c.included === undefined ? true : !!c.included,
    };
  });
}

/** Márgenes por proveedor: { "Sisegusa": 25, ... } con valores numéricos. */
export function sanitizeMargins(v: unknown): Record<string, number> {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) return bad('Los márgenes no son válidos');
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k.slice(0, 200)] = numIn(val, { max: 1000, label: 'margen' });
  }
  return out;
}

/** Datos del cliente de la cotización (solo campos conocidos, texto corto). */
export function sanitizeClient(v: unknown): Record<string, string> {
  if (!isObj(v)) return bad('Los datos del cliente no son válidos');
  const out: Record<string, string> = {};
  for (const k of ['name', 'ruc', 'address', 'contact', 'phone', 'email']) {
    out[k] = str(v[k], 300).trim();
  }
  return out;
}
