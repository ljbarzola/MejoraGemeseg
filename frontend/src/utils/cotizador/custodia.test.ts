import { describe, expect, it } from 'vitest';
import { buildCatalogMap, computeQuote } from './pricing';
import type { CotCustodiaLine } from './custodia';
import { addOrReplaceCustodia } from './quoteState';

// Línea de custodia con el precio ya congelado (como la guarda la cotización).
const custodia = (id: string, precioSinIva: number, qty = 1): CotCustodiaLine => ({
  isCustodia: true,
  id,
  description: 'Servicio de custodia móvil',
  qty,
  entrada: {} as CotCustodiaLine['entrada'],
  resultado: {
    precioSinIva,
    costoDirecto: 0,
    imprevistos: 0,
    costoTotal: precioSinIva * 0.7,
    utilidad: precioSinIva * 0.3,
    margenPct: 30,
    margenEfectivoPct: 30,
    kmServicio: 100,
    kmVehiculo: 200,
    horasTotales: 0,
    conceptos: [],
    calculadoEn: '2026-11-16T00:00:00Z',
  },
});

const totales = (items: CotCustodiaLine[], discountType: string = 'none', discountValue = 0) =>
  computeQuote({ items, catalog: buildCatalogMap([]), supplierMargins: {}, installMargin: 35, discountType, discountValue }).totals;

describe('totales con custodia móvil', () => {
  it('el IVA de la custodia se calcula al final, igual que el de los productos', () => {
    const t = totales([custodia('a', 408.31)]);
    expect(t.totalCustodiaSinIva).toBeCloseTo(408.31, 2);
    expect(t.iva).toBe(61.25);
    expect(t.total).toBe(469.56);
  });

  it('el descuento se resta antes del IVA, también sobre la custodia', () => {
    const t = totales([custodia('a', 100), custodia('b', 100)], 'percent', 10);
    expect(t.discount).toBe(20);
    expect(t.subtotal).toBe(180);
    expect(t.iva).toBe(27); // 15 % de los 180 que quedan
    expect(t.total).toBe(207);
  });

  it('la cantidad multiplica el precio', () => {
    expect(totales([custodia('a', 100, 3)]).totalCustodiaSinIva).toBe(300);
  });

  it('agregar la misma custodia otra vez la reemplaza (Recalcular no duplica)', () => {
    const primera = custodia('a', 100);
    const nueva = custodia('a', 150);
    const items = addOrReplaceCustodia([primera], nueva);
    expect(items).toHaveLength(1);
    expect(items[0]).toBe(nueva);
    expect(addOrReplaceCustodia(items, custodia('b', 10))).toHaveLength(2);
  });
});
