import { describe, expect, it } from 'vitest';
import { buildCatalogMap, computeQuote } from './pricing';
import type { CotCustodiaLine } from './custodia';
import { addOrReplaceCustodia } from './quoteState';

// Línea de custodia con el precio ya congelado (como la guarda la cotización).
const custodia = (id: string, precioSinIva: number, ivaPct: number, qty = 1): CotCustodiaLine => ({
  isCustodia: true,
  id,
  description: 'Servicio de custodia móvil',
  qty,
  entrada: {} as CotCustodiaLine['entrada'],
  resultado: {
    precioSinIva,
    ivaPct,
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
  it('una custodia al 15 % da el IVA de siempre', () => {
    const t = totales([custodia('a', 408.31, 15)]);
    expect(t.totalCustodiaSinIva).toBeCloseTo(408.31, 2);
    expect(t.iva).toBe(61.25);
    expect(t.total).toBe(469.56);
    expect(t.ivaDesglose.map((d) => d.pct)).toEqual([15]);
  });

  it('una custodia al 0 % no paga IVA y no deja una fila de 15 % vacía', () => {
    const t = totales([custodia('a', 408.31, 0)]);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(408.31);
    expect(t.ivaDesglose.map((d) => d.pct)).toEqual([0]);
  });

  it('con tasas distintas, el descuento se reparte en proporción y cada grupo lleva su IVA', () => {
    const t = totales([custodia('a', 100, 15), custodia('b', 100, 0)], 'percent', 10);
    expect(t.discount).toBe(20);
    expect(t.iva).toBe(13.5); // 15 % de los 90 que quedan del grupo al 15 %
    expect(t.total).toBe(193.5);
  });

  it('la cantidad multiplica el precio', () => {
    expect(totales([custodia('a', 100, 15, 3)]).totalCustodiaSinIva).toBe(300);
  });

  it('agregar la misma custodia otra vez la reemplaza (Recalcular no duplica)', () => {
    const primera = custodia('a', 100, 15);
    const nueva = custodia('a', 150, 15);
    const items = addOrReplaceCustodia([primera], nueva);
    expect(items).toHaveLength(1);
    expect(items[0]).toBe(nueva);
    expect(addOrReplaceCustodia(items, custodia('b', 10, 15))).toHaveLength(2);
  });
});
