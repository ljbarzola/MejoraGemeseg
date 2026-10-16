// Edición de las líneas de una cotización. Funciones PURAS (devuelven una lista nueva): así la pantalla
// puede usarlas con useState y se pueden probar sin navegador. Portadas de las acciones del carrito del
// cotizador original, pero con el producto identificado por su CÓDIGO.
import type {
  CotInstall,
  CotInstallLine,
  CotKit,
  CotKitLine,
  CotLine,
  CotProduct,
  CotProductLine,
} from './types';
import { isInstallLine, isKitLine, isProductLine } from './types';
import { DEFAULT_INSTALL_MARGIN } from './pricing';

/** Cantidad con la que entra un producto: los servicios que solo tienen costo anual entran por 12 meses. */
export function defaultQtyFor(p: CotProduct): number {
  const anual = p.kind === 'SERVICIO' && !(p.monthlyCost > 0) && p.annualCost > 0;
  if (anual) return 12;
  return p.defaultQty > 0 ? p.defaultQty : 1;
}

export function newProductLine(code: string, qty = 1): CotProductLine {
  return { code, qty, installActive: false, techCost: 0, customMargin: null };
}

/** Agrega un producto; si ya está en la cotización suma 1 a su cantidad. */
export function addProduct(items: CotLine[], p: CotProduct): CotLine[] {
  const i = items.findIndex((l) => isProductLine(l) && l.code === p.code && l.legacyPosition === undefined);
  if (i >= 0) {
    return items.map((l, k) => (k === i && isProductLine(l) ? { ...l, qty: l.qty + 1 } : l));
  }
  return [...items, newProductLine(p.code, defaultQtyFor(p))];
}

/** Agrega un kit (sus componentes incluidos) como una línea de kit. */
export function addKit(items: CotLine[], kit: CotKit, byCode: ReadonlyMap<string, CotProduct>): CotLine[] {
  const comps = kit.components
    .filter((c) => c.included && c.code && byCode.has(c.code))
    .map((c) => newProductLine(c.code, c.qty || 1));
  if (comps.length === 0) return items;
  const line: CotKitLine = { isKit: true, kitName: kit.name, qty: 1, kitComponents: comps };
  return [...items, line];
}

/** Agrega un servicio de instalación del catálogo; si ya está, suma 1 a su cantidad. */
export function addInstall(items: CotLine[], s: CotInstall): CotLine[] {
  const i = items.findIndex((l) => isInstallLine(l) && l.id === s.code);
  if (i >= 0) {
    return items.map((l, k) => (k === i && isInstallLine(l) ? { ...l, qty: l.qty + 1 } : l));
  }
  const line: CotInstallLine = {
    isInstallService: true,
    id: s.code,
    description: s.name,
    category: s.category,
    subcategory: s.subcategory,
    cost: s.unitCost,
    qty: 1,
    customCost: s.unitCost,
    customMargin: DEFAULT_INSTALL_MARGIN,
  };
  return [...items, line];
}

export function removeLine(items: CotLine[], index: number): CotLine[] {
  return items.filter((_, k) => k !== index);
}

/** Cantidad de una línea (producto, kit o servicio). Cero o menos la quita. */
export function setLineQty(items: CotLine[], index: number, qty: number): CotLine[] {
  if (!(qty > 0)) return removeLine(items, index);
  return items.map((l, k) => (k === index ? { ...l, qty } : l));
}

function mapComp(
  items: CotLine[],
  kitIndex: number,
  fn: (comps: CotProductLine[]) => CotProductLine[],
): CotLine[] {
  const out = items.map((l, k) => (k === kitIndex && isKitLine(l) ? { ...l, kitComponents: fn(l.kitComponents) } : l));
  // Un kit sin componentes se quita
  return out.filter((l) => !(isKitLine(l) && l.kitComponents.length === 0));
}

export function setKitCompQty(items: CotLine[], kitIndex: number, compIndex: number, qty: number): CotLine[] {
  return mapComp(items, kitIndex, (cs) =>
    qty > 0 ? cs.map((c, j) => (j === compIndex ? { ...c, qty } : c)) : cs.filter((_, j) => j !== compIndex),
  );
}

export function removeKitComp(items: CotLine[], kitIndex: number, compIndex: number): CotLine[] {
  return mapComp(items, kitIndex, (cs) => cs.filter((_, j) => j !== compIndex));
}

/** Activa o desactiva la instalación de un producto (o de un componente de kit). */
export function toggleInstallActive(items: CotLine[], index: number, compIndex?: number): CotLine[] {
  return items.map((l, k) => {
    if (k !== index) return l;
    if (compIndex !== undefined && isKitLine(l)) {
      return {
        ...l,
        kitComponents: l.kitComponents.map((c, j) => (j === compIndex ? { ...c, installActive: !c.installActive } : c)),
      };
    }
    return isProductLine(l) ? { ...l, installActive: !l.installActive } : l;
  });
}

/** Margen propio de un producto (o componente de kit). null = usar el del proveedor. */
export function setCustomMargin(
  items: CotLine[],
  index: number,
  margin: number | null,
  compIndex?: number,
): CotLine[] {
  return items.map((l, k) => {
    if (k !== index) return l;
    if (compIndex !== undefined && isKitLine(l)) {
      return {
        ...l,
        kitComponents: l.kitComponents.map((c, j) => (j === compIndex ? { ...c, customMargin: margin } : c)),
      };
    }
    return isProductLine(l) ? { ...l, customMargin: margin } : l;
  });
}

/** Cambia costo y/o margen de un servicio de instalación de la cotización. */
export function setInstallFields(
  items: CotLine[],
  index: number,
  patch: Partial<Pick<CotInstallLine, 'customCost' | 'customMargin' | 'qty'>>,
): CotLine[] {
  return items.map((l, k) => (k === index && isInstallLine(l) ? { ...l, ...patch } : l));
}

/** Cuántos productos (líneas de producto, de kit y servicios de instalación) tiene la cotización. */
export function countLines(items: CotLine[]): number {
  return items.length;
}

/** Productos que se pueden listar en el resumen de márgenes: código y de dónde salen. */
export interface MarginRef {
  index: number;
  compIndex?: number;
  line: CotProductLine;
  isKit: boolean;
}

export function marginRefs(items: CotLine[]): MarginRef[] {
  const out: MarginRef[] = [];
  items.forEach((l, index) => {
    if (isKitLine(l)) l.kitComponents.forEach((line, compIndex) => out.push({ index, compIndex, line, isKit: true }));
    else if (isProductLine(l)) out.push({ index, line: l, isKit: false });
  });
  return out;
}
