import { describe, expect, it } from 'vitest';
import {
  buildCatalogMap,
  calcDiscount,
  calcInstallServicePrice,
  calcItemPrice,
  compareCodes,
  computeQuote,
  dropSnapshots,
  frozenItem,
  getSupplierMargin,
  priceDiffers,
  serviceCost,
  snapshotOf,
  stripSnapshots,
  toPriceItem,
  withSnapshots,
  type PriceItem,
} from './pricing';
import type { CotInstallLine, CotKitLine, CotProduct, CotProductLine } from './types';

// Las expectativas de calcItemPrice/calcDiscount vienen de las pruebas del cotizador original.

const item = (extra: Partial<PriceItem> = {}): PriceItem => ({
  code: 'EQ-0001',
  name: 'Cámara',
  cost: 100,
  hasGanancia: true,
  hasInstalacion: false,
  isService: false,
  supplier: 'Sisegusa',
  ...extra,
});

const product = (extra: Partial<CotProduct> = {}): CotProduct => ({
  id: 1,
  kind: 'EQUIPO',
  code: 'EQ-0001',
  category: 'EQUIPOS',
  subcategory: '',
  model: '',
  name: 'Cámara',
  description: '',
  unit: 'u',
  defaultQty: 1,
  unitCost: 100,
  monthlyCost: 0,
  annualCost: 0,
  hasProfit: true,
  hasInstall: false,
  supplier: 'Sisegusa',
  lastUpdate: null,
  notes: '',
  isActive: true,
  ...extra,
});

const line = (code: string, qty = 1, extra: Partial<CotProductLine> = {}): CotProductLine => ({
  code,
  qty,
  installActive: false,
  techCost: 0,
  customMargin: null,
  ...extra,
});

describe('getSupplierMargin()', () => {
  const margins = { Sisegusa: 25, 'Sin proveedor': 10 };
  it('margen del proveedor conocido, de "Sin proveedor" y por defecto 15', () => {
    expect(getSupplierMargin(margins, 'Sisegusa')).toBe(25);
    expect(getSupplierMargin(margins, '')).toBe(10);
    expect(getSupplierMargin(margins, null)).toBe(10);
    expect(getSupplierMargin(margins, 'Otro')).toBe(15);
    expect(getSupplierMargin({}, '')).toBe(15);
  });
});

describe('calcItemPrice() - servicios', () => {
  it('solo costo + IVA', () => {
    const r = calcItemPrice(item({ cost: 100, isService: true, hasGanancia: false }), { supplierMargin: 15, installMargin: 35 });
    expect(r.baseCost).toBe(100);
    expect(r.priceBeforeIva).toBe(100);
    expect(r.iva).toBe(15);
    expect(r.total).toBe(115);
    expect(r.gananciaProveedor).toBe(0);
  });

  it('un servicio nunca lleva instalación', () => {
    const r = calcItemPrice(item({ cost: 50, isService: true, hasGanancia: false }), {
      supplierMargin: 15, installMargin: 35, techCost: 100, installActive: true,
    });
    expect(r.instalacionPrice).toBe(0);
    expect(r.total).toBe(57.5);
  });
});

describe('calcItemPrice() - equipos', () => {
  it('margen del proveedor 15 %: 100 -> 115, IVA 17.25, 132.25', () => {
    const r = calcItemPrice(item(), { supplierMargin: 15, installMargin: 35 });
    expect(r.gananciaProveedor).toBe(15);
    expect(r.priceBeforeIva).toBe(115);
    expect(r.iva).toBe(17.25);
    expect(r.subtotalEquipo).toBe(132.25);
    expect(r.total).toBe(132.25);
  });

  it('margen propio 25 % sobre 200 -> 250', () => {
    const r = calcItemPrice(item({ cost: 200 }), { supplierMargin: 25, installMargin: 35 });
    expect(r.gananciaProveedor).toBe(50);
    expect(r.priceBeforeIva).toBe(250);
  });

  it('sin ganancia: solo costo + IVA', () => {
    const r = calcItemPrice(item({ hasGanancia: false }), { supplierMargin: 15, installMargin: 35 });
    expect(r.gananciaProveedor).toBe(0);
    expect(r.priceBeforeIva).toBe(100);
    expect(r.total).toBe(115);
  });

  it('instalación por producto: solo con bandera, activa y costo técnico > 0', () => {
    const base = item({ hasInstalacion: true });
    const conInst = calcItemPrice(base, { supplierMargin: 15, installMargin: 35, techCost: 50, installActive: true });
    expect(conInst.gananciaInstalacion).toBe(17.5);
    expect(conInst.instalacionPrice).toBe(67.5);
    expect(conInst.total).toBe(199.75);
    expect(calcItemPrice(base, { supplierMargin: 15, installMargin: 35, techCost: 50, installActive: false }).instalacionPrice).toBe(0);
    expect(calcItemPrice(base, { supplierMargin: 15, installMargin: 35, techCost: 0, installActive: true }).instalacionPrice).toBe(0);
  });
});

describe('calcInstallServicePrice()', () => {
  it('costo + margen, y el IVA sobre eso', () => {
    const r = calcInstallServicePrice(100, 35);
    expect(r.ganancia).toBe(35);
    expect(r.iva).toBe(20.25);
    expect(r.total).toBe(155.25);
  });
});

describe('calcDiscount()', () => {
  it('ninguno, porcentaje y valor fijo', () => {
    expect(calcDiscount(1000, 'none', 0)).toBe(0);
    expect(calcDiscount(1000, 'percent', 10)).toBe(100);
    expect(calcDiscount(1000, 'percent', 33.33)).toBe(333.3);
    expect(calcDiscount(1000, 'fixed', 50)).toBe(50);
  });
  it('el fijo nunca supera la base; el porcentaje se limita a 0-100', () => {
    expect(calcDiscount(30, 'fixed', 50)).toBe(30);
    expect(calcDiscount(1000, 'percent', 150)).toBe(1000);
    expect(calcDiscount(1000, 'percent', -5)).toBe(0);
    expect(calcDiscount(1000, 'fixed', 0)).toBe(0);
  });
});

describe('serviceCost() / toPriceItem()', () => {
  it('servicio: mensual, si no anual/12, si no unitario', () => {
    expect(serviceCost({ monthlyCost: 30, annualCost: 0, unitCost: 5 })).toBe(30);
    expect(serviceCost({ monthlyCost: 0, annualCost: 100, unitCost: 5 })).toBe(8.33);
    expect(serviceCost({ monthlyCost: 0, annualCost: 0, unitCost: 5 })).toBe(5);
    expect(serviceCost({ monthlyCost: 0, annualCost: 0, unitCost: 0 })).toBe(0);
  });
  it('un servicio nunca lleva ganancia ni instalación; solo los equipos tienen proveedor', () => {
    const s = toPriceItem(product({ kind: 'SERVICIO', code: 'SV-0001', monthlyCost: 30, hasProfit: true, hasInstall: true, supplier: 'X' }));
    expect(s).toMatchObject({ isService: true, cost: 30, hasGanancia: false, hasInstalacion: false, supplier: '' });
    expect(toPriceItem(product({ kind: 'MATERIAL', supplier: 'X' })).supplier).toBe('');
    expect(toPriceItem(product({ kind: 'EQUIPO', supplier: 'X' })).supplier).toBe('X');
  });
});

describe('precio guardado (snap)', () => {
  it('guarda solo lo que afecta el precio', () => {
    expect(snapshotOf(item())).toEqual({ cost: 100, hasGanancia: true, hasInstalacion: false, isService: false, supplier: 'Sisegusa' });
  });
  it('detecta cambio de costo, de banderas o de proveedor; no de descripción', () => {
    const snap = snapshotOf(item());
    expect(priceDiffers(item(), snap)).toBe(false);
    expect(priceDiffers(item({ cost: 120 }), snap)).toBe(true);
    expect(priceDiffers(item({ hasGanancia: false }), snap)).toBe(true);
    expect(priceDiffers(item({ supplier: 'Otro' }), snap)).toBe(true);
    expect(priceDiffers(item({ name: 'Otro nombre' }), snap)).toBe(false);
  });
  it('sin snap no hay diferencia (se usa el precio actual)', () => {
    expect(priceDiffers(item(), undefined)).toBe(false);
    expect(priceDiffers(item(), null)).toBe(false);
  });
  it('la copia congelada usa el costo guardado y recuerda el actual', () => {
    const f = frozenItem(item({ cost: 150 }), snapshotOf(item()));
    expect(f.cost).toBe(100);
    expect(f.currentCost).toBe(150);
    expect(f.frozen).toBe(true);
  });
});

describe('computeQuote() - totales (misma fórmula que pantalla y PDF)', () => {
  const catalog = buildCatalogMap([
    product({ code: 'EQ-0001', unitCost: 100 }),
    product({ id: 2, code: 'EQ-0002', unitCost: 200, hasProfit: false, supplier: '' }),
    product({ id: 3, kind: 'SERVICIO', code: 'SV-0001', monthlyCost: 30, hasProfit: false }),
  ]);
  const base = {
    catalog,
    supplierMargins: { Sisegusa: 25 },
    installMargin: 35,
    discountType: 'none',
    discountValue: 0,
  };

  it('8 × (100 + 25 %) = 1000; IVA 15 % -> 1150', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 8)] });
    expect(r.totals.base).toBe(1000);
    expect(r.totals.iva).toBe(150);
    expect(r.totals.total).toBe(1150);
  });

  it('descuento fijo $100 se resta ANTES del IVA: (1000 - 100) × 1.15 = 1035', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 8)], discountType: 'fixed', discountValue: 100 });
    expect(r.totals.discount).toBe(100);
    expect(r.totals.subtotal).toBe(900);
    expect(r.totals.iva).toBe(135);
    expect(r.totals.total).toBe(1035);
  });

  it('descuento 10 % equivale: 1035', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 8)], discountType: 'percent', discountValue: 10 });
    expect(r.totals.total).toBe(1035);
  });

  it('un descuento fijo mayor que la base no deja total negativo', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 8)], discountType: 'fixed', discountValue: 5000 });
    expect(r.totals.total).toBe(0);
  });

  it('margen propio de la línea gana al del proveedor', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 1, { customMargin: 50 })] });
    expect(r.totals.base).toBe(150);
  });

  it('servicios de instalación entran a la base del descuento y pagan IVA una sola vez', () => {
    const inst: CotInstallLine = {
      isInstallService: true, id: 'INST-001', description: 'Instalación', category: '', subcategory: '',
      cost: 100, qty: 1, customCost: null, customMargin: 0,
    };
    const r = computeQuote({ ...base, items: [line('EQ-0001', 8), inst], discountType: 'fixed', discountValue: 100 });
    expect(r.totals.totalInstSinIva).toBe(100);
    expect(r.totals.total).toBe(1150); // (1000 + 100 - 100) × 1.15
  });

  it('el margen de instalación por defecto (35 %) se aplica si la línea no trae uno', () => {
    const inst: CotInstallLine = {
      isInstallService: true, id: 'INST-001', description: '', category: '', subcategory: '',
      cost: 100, qty: 2, customCost: null, customMargin: null,
    };
    const r = computeQuote({ ...base, items: [inst] });
    expect(r.totals.totalInstSinIva).toBe(270); // (100 + 35) × 2
  });

  it('kit: cada componente se multiplica por la cantidad del kit', () => {
    const kit: CotKitLine = { isKit: true, kitName: 'Kit', qty: 2, kitComponents: [line('EQ-0001', 4)] };
    const r = computeQuote({ ...base, items: [kit] });
    expect(r.totals.base).toBe(1000); // 4 × 2 = 8 × 125
  });

  it('servicio: costo + IVA, sin margen', () => {
    const r = computeQuote({ ...base, items: [line('SV-0001', 1)] });
    expect(r.totals.base).toBe(30);
    expect(r.totals.total).toBe(34.5);
  });

  it('un código que ya no existe aporta 0 y se avisa', () => {
    const r = computeQuote({ ...base, items: [line('EQ-9999', 3), line('EQ-0001', 1)] });
    expect(r.missing).toEqual(['EQ-9999']);
    expect(r.totals.base).toBe(125);
  });

  it('un producto DESACTIVADO sigue contando en la cotización que lo usó', () => {
    const cat = buildCatalogMap([product({ code: 'EQ-0001', isActive: false })]);
    const r = computeQuote({ ...base, catalog: cat, items: [line('EQ-0001', 8)] });
    expect(r.totals.base).toBe(1000);
    expect(r.missing).toEqual([]);
  });

  it('el detalle por línea: costo, ganancia y PVP sin IVA', () => {
    const r = computeQuote({ ...base, items: [line('EQ-0001', 2)] });
    const l = r.lines[0];
    expect(l.kind).toBe('product');
    if (l.kind === 'product') {
      expect(l.costTotal).toBe(200);
      expect(l.gananciaTotal).toBe(50);
      expect(l.pvpTotal).toBe(250);
    }
  });
});

describe('computeQuote() - precios congelados', () => {
  const snapViejo = { cost: 80, hasGanancia: true, hasInstalacion: false, isService: false, supplier: 'Sisegusa' };
  const mk = (cost: number) => buildCatalogMap([product({ unitCost: cost })]);
  const input = (cost: number, snap?: typeof snapViejo) => ({
    items: [line('EQ-0001', 10, { snap })],
    catalog: mk(cost),
    supplierMargins: { Sisegusa: 25 },
    installMargin: 35,
    discountType: 'none',
    discountValue: 0,
  });

  it('con precio guardado se usa ESE aunque el catálogo haya subido', () => {
    const r = computeQuote(input(100, snapViejo));
    expect(r.totals.base).toBe(1000); // 10 × (80 + 25 %)
    expect(r.totals.total).toBe(1150);
  });

  it('avisa del cambio: costo cuando se cotizó vs costo actual', () => {
    const r = computeQuote(input(100, snapViejo));
    expect(r.priceChanges).toEqual([{ code: 'EQ-0001', name: 'Cámara', frozenCost: 80, currentCost: 100 }]);
  });

  it('si el precio no cambió no hay aviso', () => {
    const r = computeQuote(input(80, snapViejo));
    expect(r.priceChanges).toEqual([]);
  });

  it('sin precio guardado (cotización antigua o producto recién agregado) se usa el actual', () => {
    const r = computeQuote(input(100));
    expect(r.totals.base).toBe(1250);
    expect(r.priceChanges).toEqual([]);
  });

  it('el mismo producto en dos líneas se avisa una sola vez', () => {
    const r = computeQuote({
      ...input(100),
      items: [line('EQ-0001', 1, { snap: snapViejo }), line('EQ-0001', 2, { snap: snapViejo })],
    });
    expect(r.priceChanges).toHaveLength(1);
  });

  it('también en los componentes de un kit', () => {
    const kit: CotKitLine = { isKit: true, kitName: 'K', qty: 1, kitComponents: [line('EQ-0001', 10, { snap: snapViejo })] };
    const r = computeQuote({ ...input(100), items: [kit] });
    expect(r.totals.base).toBe(1000);
    expect(r.priceChanges).toHaveLength(1);
  });

  it('cuenta las líneas antiguas ubicadas por posición', () => {
    const r = computeQuote({ ...input(100), items: [line('EQ-0001', 1, { legacyPosition: 99 }), line('EQ-0001', 1)] });
    expect(r.legacyCount).toBe(1);
  });
});

describe('withSnapshots() / dropSnapshots() (guardar y "Usar precios actuales")', () => {
  const cat = buildCatalogMap([product({ unitCost: 100 })]);
  const snapViejo = { cost: 80, hasGanancia: true, hasInstalacion: false, isService: false, supplier: 'Sisegusa' };

  it('al guardar, la línea nueva recibe el precio de ese momento y la que ya tenía lo conserva', () => {
    const [nueva, vieja] = withSnapshots([line('EQ-0001', 1), line('EQ-0001', 1, { snap: snapViejo })], cat) as CotProductLine[];
    expect(nueva.snap?.cost).toBe(100);
    expect(vieja.snap?.cost).toBe(80);
  });

  it('los servicios de instalación no llevan precio guardado (ya van por valor)', () => {
    const inst: CotInstallLine = {
      isInstallService: true, id: 'I', description: '', category: '', subcategory: '', cost: 5, qty: 1, customCost: null, customMargin: null,
    };
    expect(withSnapshots([inst], cat)[0]).toEqual(inst);
  });

  it('"Usar precios actuales" quita el precio guardado solo de los productos indicados', () => {
    const items = [line('EQ-0001', 1, { snap: snapViejo }), line('EQ-0002', 1, { snap: snapViejo })];
    const out = dropSnapshots(items, new Set(['EQ-0001'])) as CotProductLine[];
    expect(out[0].snap).toBeUndefined();
    expect(out[1].snap).toBeDefined();
  });

  it('tras "Usar precios actuales" y guardar, la cotización conserva los NUEVOS precios', () => {
    const items = dropSnapshots([line('EQ-0001', 10, { snap: snapViejo })], new Set(['EQ-0001']));
    const guardado = withSnapshots(items, cat) as CotProductLine[];
    expect(guardado[0].snap?.cost).toBe(100);
  });
});

describe('compareCodes()', () => {
  it('ordena por prefijo y luego por número', () => {
    const codes = ['SV-0002', 'EQ-0010', 'MT-0003', 'EQ-0002', 'EQ-0100'];
    expect(codes.sort(compareCodes)).toEqual(['EQ-0002', 'EQ-0010', 'EQ-0100', 'MT-0003', 'SV-0002']);
  });
});

describe('stripSnapshots() (plantillas)', () => {
  it('quita el precio guardado de productos y de componentes de kit', () => {
    const snap = { cost: 80, hasGanancia: true, hasInstalacion: false, isService: false, supplier: '' };
    const kit: CotKitLine = { isKit: true, kitName: 'K', qty: 1, kitComponents: [line('EQ-0002', 1, { snap })] };
    const out = stripSnapshots([line('EQ-0001', 1, { snap }), kit]);
    expect((out[0] as CotProductLine).snap).toBeUndefined();
    expect(((out[1] as CotKitLine).kitComponents[0] as CotProductLine).snap).toBeUndefined();
  });
});
