import { describe, expect, it } from 'vitest';
import { calcularAlertas, SIN_LIMITES, type CotLimites } from './alertas';
import { buildCatalogMap, computeQuote } from './pricing';
import type { CotInstallLine, CotKitLine, CotProduct, CotProductLine } from './types';

// Equipo de costo 100 con ganancia 15 % -> se vende a 115 antes de IVA.
// Servicio de costo 40 -> se vende a 40 (no lleva ganancia).

const producto = (extra: Partial<CotProduct> = {}): CotProduct => ({
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
  minPrice: null,
  isActive: true,
  ...extra,
});
const servicio = (extra: Partial<CotProduct> = {}) =>
  producto({ id: 2, kind: 'SERVICIO', code: 'SV-0001', name: 'Monitoreo', unitCost: 0, monthlyCost: 40, hasProfit: false, ...extra });

const linea = (code: string, qty = 1, extra: Partial<CotProductLine> = {}): CotProductLine => ({
  code,
  qty,
  installActive: false,
  techCost: 0,
  customMargin: null,
  ...extra,
});

function armar(
  productos: CotProduct[],
  items: (CotProductLine | CotKitLine | CotInstallLine)[],
  descuento: { tipo: string; valor: number } = { tipo: 'none', valor: 0 },
) {
  const catalog = buildCatalogMap(productos);
  const comp = computeQuote({
    items,
    catalog,
    supplierMargins: {},
    installMargin: 35,
    discountType: descuento.tipo,
    discountValue: descuento.valor,
  });
  return { comp, catalog };
}
const limites = (extra: Partial<CotLimites> = {}): CotLimites => ({ ...SIN_LIMITES, ...extra });

describe('calcularAlertas() - sin límites', () => {
  it('sin límites configurados no avisa nada, ni con 90 % de descuento', () => {
    const { comp, catalog } = armar([producto()], [linea('EQ-0001')], { tipo: 'percent', valor: 90 });
    expect(calcularAlertas(comp, catalog, SIN_LIMITES)).toEqual([]);
    expect(calcularAlertas(comp, catalog, null)).toEqual([]);
  });

  it('una cotización vacía no avisa', () => {
    const { comp, catalog } = armar([producto()], []);
    expect(calcularAlertas(comp, catalog, limites({ maxDescuentoPct: 5, minGananciaPct: 50 }))).toEqual([]);
  });
});

describe('calcularAlertas() - descuento máximo', () => {
  it('avisa cuando el descuento pasa el máximo y no cuando es igual o menor', () => {
    const l = limites({ maxDescuentoPct: 10 });
    const alto = armar([producto()], [linea('EQ-0001')], { tipo: 'percent', valor: 15 });
    const a = calcularAlertas(alto.comp, alto.catalog, l);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('descuento');
    expect(a[0].mensaje).toContain('15 %');
    expect(a[0].mensaje).toContain('10 %');

    const justo = armar([producto()], [linea('EQ-0001')], { tipo: 'percent', valor: 10 });
    expect(calcularAlertas(justo.comp, justo.catalog, l)).toEqual([]);
  });

  it('un descuento de valor fijo se convierte a porcentaje de la cotización', () => {
    // Base 115; descuento fijo 23 = 20 %
    const { comp, catalog } = armar([producto()], [linea('EQ-0001')], { tipo: 'fixed', valor: 23 });
    const a = calcularAlertas(comp, catalog, limites({ maxDescuentoPct: 10 }));
    expect(a[0].mensaje).toContain('20 %');
  });

  it('con solo servicios manda el límite de servicios y el general no cuenta', () => {
    const { comp, catalog } = armar([servicio()], [linea('SV-0001')], { tipo: 'percent', valor: 8 });
    expect(calcularAlertas(comp, catalog, limites({ maxDescuentoPct: 10 }))).toEqual([]);
    const a = calcularAlertas(comp, catalog, limites({ maxDescuentoPct: 10, maxDescuentoServiciosPct: 5 }));
    expect(a).toHaveLength(1);
    expect(a[0].mensaje).toContain('servicios');
  });

  it('si la cotización mezcla equipos y servicios manda el más estricto', () => {
    const { comp, catalog } = armar([producto(), servicio()], [linea('EQ-0001'), linea('SV-0001')], { tipo: 'percent', valor: 8 });
    const a = calcularAlertas(comp, catalog, limites({ maxDescuentoPct: 10, maxDescuentoServiciosPct: 5 }));
    expect(a).toHaveLength(1);
    expect(a[0].mensaje).toContain('5 %');
    expect(a[0].mensaje).toContain('incluye servicios');
  });
});

describe('calcularAlertas() - ganancia mínima', () => {
  it('sin descuento la ganancia es la del margen del proveedor (15 %)', () => {
    const { comp, catalog } = armar([producto()], [linea('EQ-0001')]);
    expect(calcularAlertas(comp, catalog, limites({ minGananciaPct: 15 }))).toEqual([]);
    const a = calcularAlertas(comp, catalog, limites({ minGananciaPct: 20 }));
    expect(a[0].tipo).toBe('ganancia');
    expect(a[0].mensaje).toContain('15 %');
  });

  it('el descuento reduce la ganancia: 115 con 10 % de descuento = 103,5 sobre costo 100 = 3,5 %', () => {
    const { comp, catalog } = armar([producto()], [linea('EQ-0001')], { tipo: 'percent', valor: 10 });
    const a = calcularAlertas(comp, catalog, limites({ minGananciaPct: 10 }));
    expect(a[0].mensaje).toContain('3,5 %');
  });

  it('el margen propio de una línea cuenta', () => {
    const { comp, catalog } = armar([producto()], [linea('EQ-0001', 1, { customMargin: 2 })]);
    expect(calcularAlertas(comp, catalog, limites({ minGananciaPct: 10 }))[0].tipo).toBe('ganancia');
  });

  it('los servicios no entran en el cálculo (se venden al costo y no sumarían ganancia)', () => {
    const solo = armar([servicio()], [linea('SV-0001')]);
    expect(calcularAlertas(solo.comp, solo.catalog, limites({ minGananciaPct: 30 }))).toEqual([]);
    const mixta = armar([producto(), servicio()], [linea('EQ-0001'), linea('SV-0001', 5)]);
    // Solo el equipo: 15 % de ganancia; los 5 servicios no la diluyen
    expect(calcularAlertas(mixta.comp, mixta.catalog, limites({ minGananciaPct: 15 }))).toEqual([]);
  });
});

describe('calcularAlertas() - precio mínimo por producto', () => {
  it('avisa con el nombre del producto cuando el precio efectivo queda por debajo', () => {
    // Se vende a 115; con 20 % de descuento queda en 92
    const cat = [producto({ minPrice: 100 })];
    const { comp, catalog } = armar(cat, [linea('EQ-0001')], { tipo: 'percent', valor: 20 });
    const a = calcularAlertas(comp, catalog, limites());
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('minimo');
    expect(a[0].detalle[0]).toContain('EQ-0001');
    expect(a[0].detalle[0]).toContain('$92.00');
    expect(a[0].detalle[0]).toContain('$100.00');
  });

  it('funciona aunque no haya ningún otro límite configurado y no avisa si llega justo', () => {
    const { comp, catalog } = armar([producto({ minPrice: 115 })], [linea('EQ-0001')]);
    expect(calcularAlertas(comp, catalog, limites())).toEqual([]);
  });

  it('sirve para servicios y para productos dentro de un kit, sin repetir el aviso', () => {
    const kit: CotKitLine = { isKit: true, kitName: 'Kit', qty: 2, kitComponents: [linea('EQ-0001', 1), linea('EQ-0001', 2)] };
    const { comp, catalog } = armar([producto({ minPrice: 200 }), servicio({ minPrice: 50 })], [kit, linea('SV-0001')]);
    const a = calcularAlertas(comp, catalog, limites());
    expect(a).toHaveLength(1);
    expect(a[0].mensaje).toContain('2 productos');
    expect(a[0].detalle).toHaveLength(2);
  });

  it('un mínimo vacío o en cero no vigila nada', () => {
    const { comp, catalog } = armar([producto({ minPrice: 0 }), servicio({ minPrice: null })], [linea('EQ-0001'), linea('SV-0001')], {
      tipo: 'percent',
      valor: 50,
    });
    expect(calcularAlertas(comp, catalog, limites())).toEqual([]);
  });
});
