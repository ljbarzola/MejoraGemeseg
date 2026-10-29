// Cálculo de precios del Cotizador. Lógica PURA (sin pantalla ni red) portada del cotizador
// original de Gemeseg, con estas reglas:
//   - El descuento SIEMPRE se resta ANTES del IVA (igual que la pantalla y el PDF).
//   - IVA 15 % una sola vez, sobre el subtotal con descuento.
//   - Un producto se identifica por su CÓDIGO, nunca por su posición en la lista.
//   - Una cotización conserva el precio con el que se hizo (`snap`); si el catálogo cambió se usa
//     el precio guardado y se avisa de la diferencia.
import type {
  CotInstallLine,
  CotKitLine,
  CotLine,
  CotProduct,
  CotProductLine,
  CotSnap,
  DiscountType,
} from './types';
import { isInstallLine, isKitLine } from './types';

export const IVA_RATE = 0.15;
export const DEFAULT_SUPPLIER_MARGIN = 15;
export const DEFAULT_INSTALL_MARGIN = 35;
export const SIN_PROVEEDOR = 'Sin proveedor';

const r2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Producto "para cotizar"
// ---------------------------------------------------------------------------

/** Lo mínimo de un producto que determina su precio. */
export interface PriceItem {
  code: string;
  name: string;
  cost: number;
  hasGanancia: boolean;
  hasInstalacion: boolean;
  isService: boolean;
  /** Unidad de venta del catálogo (u, m, mes...); sale en la columna «Und». */
  unit?: string;
  supplier: string;
  /** Copia con el precio guardado en la cotización (distinto al actual del catálogo). */
  frozen?: boolean;
  currentCost?: number;
}

/** Costo efectivo de un servicio: mensual, o anual/12, o unitario. */
export function serviceCost(p: Pick<CotProduct, 'monthlyCost' | 'annualCost' | 'unitCost'>): number {
  if (p.monthlyCost > 0) return p.monthlyCost;
  if (p.annualCost > 0) return r2(p.annualCost / 12);
  return p.unitCost > 0 ? p.unitCost : 0;
}

export function toPriceItem(p: CotProduct): PriceItem {
  const isService = p.kind === 'SERVICIO';
  return {
    code: p.code,
    name: p.name,
    cost: isService ? serviceCost(p) : p.unitCost || 0,
    hasGanancia: isService ? false : p.hasProfit,
    hasInstalacion: isService ? false : p.hasInstall,
    isService,
    unit: p.unit || '',
    // Solo los equipos tienen proveedor (igual que el original)
    supplier: p.kind === 'EQUIPO' ? p.supplier || '' : '',
  };
}

export function getSupplierMargin(margins: Record<string, number>, supplier: string | null | undefined): number {
  return margins[supplier || SIN_PROVEEDOR] ?? DEFAULT_SUPPLIER_MARGIN;
}

// ---------------------------------------------------------------------------
// Precio de un producto
// ---------------------------------------------------------------------------

export interface ItemPrice {
  baseCost: number;
  gananciaProveedor: number;
  /** Precio de venta sin IVA (costo + ganancia del proveedor). */
  priceBeforeIva: number;
  iva: number;
  subtotalEquipo: number;
  techCost: number;
  gananciaInstalacion: number;
  instalacionPrice: number;
  total: number;
  hasGanancia: boolean;
  hasInstalacion: boolean;
}

export interface PriceOptions {
  supplierMargin: number;
  installMargin: number;
  techCost?: number;
  installActive?: boolean;
}

/** Servicios: costo + IVA. Equipos/materiales: costo → margen del proveedor → IVA → instalación opcional. */
export function calcItemPrice(item: PriceItem, opts: PriceOptions): ItemPrice {
  const techCost = opts.techCost ?? 0;
  const installActive = opts.installActive ?? false;

  if (item.isService) {
    const price = item.cost;
    const iva = r2(price * IVA_RATE);
    return {
      baseCost: price,
      gananciaProveedor: 0,
      priceBeforeIva: price,
      iva,
      subtotalEquipo: price + iva,
      techCost: 0,
      gananciaInstalacion: 0,
      instalacionPrice: 0,
      total: price + iva,
      hasGanancia: false,
      hasInstalacion: false,
    };
  }

  const baseCost = item.cost;
  const gananciaProveedor = item.hasGanancia ? r2(baseCost * (opts.supplierMargin / 100)) : 0;
  const priceBeforeIva = baseCost + gananciaProveedor;
  const iva = r2(priceBeforeIva * IVA_RATE);
  const subtotalEquipo = priceBeforeIva + iva;

  let gananciaInstalacion = 0;
  let instalacionPrice = 0;
  if (item.hasInstalacion && installActive && techCost > 0) {
    gananciaInstalacion = r2(techCost * (opts.installMargin / 100));
    instalacionPrice = techCost + gananciaInstalacion;
  }

  return {
    baseCost,
    gananciaProveedor,
    priceBeforeIva,
    iva,
    subtotalEquipo,
    techCost,
    gananciaInstalacion,
    instalacionPrice,
    total: subtotalEquipo + instalacionPrice,
    hasGanancia: item.hasGanancia,
    hasInstalacion: item.hasInstalacion,
  };
}

/** Servicio de instalación del catálogo: costo + margen, y el IVA sobre eso. */
export function calcInstallServicePrice(cost: number, marginPct: number) {
  const baseCost = cost || 0;
  const ganancia = r2(baseCost * (marginPct / 100));
  const subtotal = baseCost + ganancia;
  const iva = r2(subtotal * IVA_RATE);
  return { baseCost, ganancia, iva, total: subtotal + iva };
}

export function calcDiscount(base: number, type: DiscountType | string, value: number): number {
  if (type === 'percent' && value > 0) {
    const pct = Math.min(100, Math.max(0, value));
    return r2(base * (pct / 100));
  }
  if (type === 'fixed' && value > 0) {
    return Math.min(Math.max(0, value), Math.max(0, base));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Precio guardado (snap)
// ---------------------------------------------------------------------------

export function snapshotOf(item: PriceItem): CotSnap {
  return {
    cost: Number(item.cost) || 0,
    hasGanancia: !!item.hasGanancia,
    hasInstalacion: !!item.hasInstalacion,
    isService: !!item.isService,
    supplier: item.supplier || '',
  };
}

/** ¿El producto actual tiene un precio distinto al guardado en la cotización? */
export function priceDiffers(item: PriceItem, snap: CotSnap | undefined | null): boolean {
  if (!snap || typeof snap.cost !== 'number') return false;
  const a = snapshotOf(item);
  return (
    Math.abs(a.cost - snap.cost) > 0.0005 ||
    a.hasGanancia !== !!snap.hasGanancia ||
    a.hasInstalacion !== !!snap.hasInstalacion ||
    a.isService !== !!snap.isService ||
    a.supplier !== (snap.supplier || '')
  );
}

export function frozenItem(item: PriceItem, snap: CotSnap): PriceItem {
  return {
    ...item,
    cost: snap.cost,
    hasGanancia: !!snap.hasGanancia,
    hasInstalacion: !!snap.hasInstalacion,
    isService: !!snap.isService,
    supplier: snap.supplier || '',
    frozen: true,
    currentCost: item.cost,
  };
}

export interface PriceChange {
  code: string;
  name: string;
  frozenCost: number;
  currentCost: number;
}

// ---------------------------------------------------------------------------
// Cotización completa
// ---------------------------------------------------------------------------

/** Catálogo por código. Incluye los productos desactivados: las cotizaciones que los usaron los siguen encontrando. */
export type CatalogMap = ReadonlyMap<string, CotProduct>;

export function buildCatalogMap(products: CotProduct[]): Map<string, CotProduct> {
  return new Map(products.map((p) => [p.code, p]));
}

export interface ProductComputation {
  line: CotProductLine;
  item: PriceItem | null;
  price: ItemPrice | null;
  margin: number;
  qty: number;
  /** Costo del proveedor por la cantidad. */
  costTotal: number;
  gananciaTotal: number;
  /** Precio de venta sin IVA por la cantidad (la columna PVP). */
  pvpTotal: number;
  change: PriceChange | null;
  missing: boolean;
  legacy: boolean;
}

export type LineComputation =
  | ({ kind: 'product' } & ProductComputation)
  | {
      kind: 'kit';
      line: CotKitLine;
      comps: ProductComputation[];
      costTotal: number;
      gananciaTotal: number;
      pvpTotal: number;
    }
  | {
      kind: 'install';
      line: CotInstallLine;
      baseCost: number;
      margin: number;
      ganancia: number;
      costTotal: number;
      gananciaTotal: number;
      /** (costo + ganancia) × cantidad, sin IVA. */
      pvpTotal: number;
    };

export interface QuoteTotals {
  subtotalEquipo: number;
  totalInstSinIva: number;
  /** Productos + instalaciones, antes del descuento y del IVA. */
  base: number;
  discount: number;
  subtotal: number;
  iva: number;
  total: number;
}

export interface QuoteComputation {
  lines: LineComputation[];
  totals: QuoteTotals;
  /** Productos cuyo precio actual difiere del precio con que se cotizó (sin repetir). */
  priceChanges: PriceChange[];
  /** Códigos que ya no existen en el catálogo. */
  missing: string[];
  /** Líneas importadas del cotizador antiguo que se ubicaron por posición, no por código. */
  legacyCount: number;
}

export interface QuoteInput {
  items: CotLine[];
  catalog: CatalogMap;
  supplierMargins: Record<string, number>;
  installMargin: number;
  discountType: DiscountType | string;
  discountValue: number;
}

function computeProduct(
  line: CotProductLine,
  catalog: CatalogMap,
  supplierMargins: Record<string, number>,
  installMargin: number,
  qtyMultiplier: number,
): ProductComputation {
  const qty = (line.qty ?? 1) * qtyMultiplier;
  const product = catalog.get(line.code);
  const legacy = line.legacyPosition !== undefined;
  if (!product) {
    return {
      line, item: null, price: null, margin: 0, qty,
      costTotal: 0, gananciaTotal: 0, pvpTotal: 0, change: null, missing: true, legacy,
    };
  }
  const current = toPriceItem(product);
  let item = current;
  let change: PriceChange | null = null;
  if (line.snap && priceDiffers(current, line.snap)) {
    item = frozenItem(current, line.snap);
    change = { code: current.code, name: current.name, frozenCost: line.snap.cost, currentCost: current.cost };
  }
  const margin = line.customMargin ?? getSupplierMargin(supplierMargins, item.supplier);
  const price = calcItemPrice(item, {
    supplierMargin: margin,
    installMargin,
    techCost: line.techCost,
    installActive: line.installActive,
  });
  return {
    line,
    item,
    price,
    margin,
    qty,
    costTotal: price.baseCost * qty,
    gananciaTotal: price.gananciaProveedor * qty,
    pvpTotal: price.priceBeforeIva * qty,
    change,
    missing: false,
    legacy,
  };
}

/** Calcula todo lo que se muestra de una cotización: cada línea, los totales y los avisos. */
export function computeQuote(input: QuoteInput): QuoteComputation {
  const { items, catalog, supplierMargins, installMargin } = input;
  const lines: LineComputation[] = [];
  const changes = new Map<string, PriceChange>();
  const missing = new Set<string>();
  let legacyCount = 0;
  let subtotalEquipo = 0;
  let totalInstSinIva = 0;

  const note = (c: ProductComputation) => {
    if (c.change) changes.set(c.change.code, c.change);
    if (c.missing && c.line.code) missing.add(c.line.code);
    if (c.legacy) legacyCount++;
  };

  for (const line of items) {
    if (isInstallLine(line)) {
      const baseCost = (line.customCost ?? line.cost) || 0;
      const margin = line.customMargin ?? installMargin;
      const p = calcInstallServicePrice(baseCost, margin);
      const qty = line.qty || 1;
      const pvpTotal = (p.baseCost + p.ganancia) * qty;
      totalInstSinIva += pvpTotal;
      lines.push({
        kind: 'install', line, baseCost: p.baseCost, margin, ganancia: p.ganancia,
        costTotal: p.baseCost * qty, gananciaTotal: p.ganancia * qty, pvpTotal,
      });
      continue;
    }
    if (isKitLine(line)) {
      const comps = (line.kitComponents ?? []).map((cc) =>
        computeProduct(cc, catalog, supplierMargins, installMargin, line.qty || 1),
      );
      comps.forEach(note);
      const pvpTotal = comps.reduce((s, c) => s + c.pvpTotal, 0);
      subtotalEquipo += pvpTotal;
      lines.push({
        kind: 'kit', line, comps,
        costTotal: comps.reduce((s, c) => s + c.costTotal, 0),
        gananciaTotal: comps.reduce((s, c) => s + c.gananciaTotal, 0),
        pvpTotal,
      });
      continue;
    }
    const c = computeProduct(line, catalog, supplierMargins, installMargin, 1);
    note(c);
    subtotalEquipo += c.pvpTotal;
    lines.push({ kind: 'product', ...c });
  }

  const base = subtotalEquipo + totalInstSinIva;
  const discount = calcDiscount(base, input.discountType, input.discountValue);
  const subtotal = base - discount;
  const iva = r2(subtotal * IVA_RATE);
  // Igual que lo que se muestra (toFixed(2)): evita diferencias de medio centavo entre pantalla e historial
  const total = Math.max(0, Number((subtotal + iva).toFixed(2)));

  return {
    lines,
    totals: { subtotalEquipo, totalInstSinIva, base, discount, subtotal, iva, total },
    priceChanges: [...changes.values()],
    missing: [...missing],
    legacyCount,
  };
}

// ---------------------------------------------------------------------------
// Guardar / "Usar precios actuales"
// ---------------------------------------------------------------------------

function snapLine(line: CotProductLine, catalog: CatalogMap): CotProductLine {
  if (line.snap) return line; // ya tiene su precio guardado: se conserva
  const p = catalog.get(line.code);
  return p ? { ...line, snap: snapshotOf(toPriceItem(p)) } : line;
}

/** Antes de guardar: a cada línea nueva se le guarda el precio de ese momento. Las que ya lo traen se respetan. */
export function withSnapshots(items: CotLine[], catalog: CatalogMap): CotLine[] {
  return items.map((l) => {
    if (isInstallLine(l)) return l;
    if (isKitLine(l)) return { ...l, kitComponents: l.kitComponents.map((c) => snapLine(c, catalog)) };
    return snapLine(l, catalog);
  });
}

/** "Usar precios actuales": quita el precio guardado de los productos indicados; al guardar tomarán el de hoy. */
export function dropSnapshots(items: CotLine[], codes: ReadonlySet<string>): CotLine[] {
  const drop = (c: CotProductLine): CotProductLine => {
    if (!codes.has(c.code) || !c.snap) return c;
    const { snap: _snap, ...resto } = c;
    void _snap;
    return resto;
  };
  return items.map((l) => {
    if (isInstallLine(l)) return l;
    if (isKitLine(l)) return { ...l, kitComponents: l.kitComponents.map(drop) };
    return drop(l);
  });
}

/** Quita TODOS los precios guardados (una plantilla siempre se carga con los precios de hoy). */
export function stripSnapshots(items: CotLine[]): CotLine[] {
  const strip = (c: CotProductLine): CotProductLine => {
    if (!c.snap) return c;
    const { snap: _snap, ...resto } = c;
    void _snap;
    return resto;
  };
  return items.map((l) => {
    if (isInstallLine(l)) return l;
    if (isKitLine(l)) return { ...l, kitComponents: l.kitComponents.map(strip) };
    return strip(l);
  });
}

// ---------------------------------------------------------------------------
// Códigos
// ---------------------------------------------------------------------------

/** Orden natural de códigos: por prefijo (EQ-, MT-, SV-) y luego por número. */
export function compareCodes(a: string, b: string): number {
  const pa = a.replace(/\d+.*$/, '');
  const pb = b.replace(/\d+.*$/, '');
  if (pa !== pb) return pa.localeCompare(pb);
  return (parseInt(a.replace(/^\D+/, ''), 10) || 0) - (parseInt(b.replace(/^\D+/, ''), 10) || 0);
}
