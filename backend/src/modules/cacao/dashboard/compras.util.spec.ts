import { KG_POR_QUINTAL } from '../unit-config/unit-config.service';
import {
  calcularCompras,
  estadoEntrega,
  type RecepcionCompra,
} from './compras.util';

function entrega(over: Partial<RecepcionCompra> = {}): RecepcionCompra {
  return {
    date: new Date('2026-10-05T00:00:00.000Z'),
    supplierId: 1,
    supplierName: 'Proveedor A',
    qualityName: 'CCN-51',
    netWeight: 1000,
    costoPorKg: 2,
    liquidadoKg: 0,
    closedAt: null,
    ...over,
  };
}

describe('estadoEntrega', () => {
  it('sin liquidar, parcial, liquidada y cerrada', () => {
    expect(estadoEntrega(entrega())).toBe('SIN_LIQUIDAR');
    expect(estadoEntrega(entrega({ liquidadoKg: 400 }))).toBe('PARCIAL');
    expect(estadoEntrega(entrega({ liquidadoKg: 1000 }))).toBe('LIQUIDADA');
    // una entrega cerrada se muestra cerrada aunque se haya liquidado en parte
    expect(
      estadoEntrega(entrega({ liquidadoKg: 400, closedAt: new Date() })),
    ).toBe('CERRADA');
  });
});

describe('calcularCompras', () => {
  it('sin entregas: ceros y sin precio promedio', () => {
    const r = calcularCompras([], 'dia');
    expect(r.totales).toMatchObject({
      entregas: 0,
      pesoNetoKg: 0,
      compra: 0,
      precioPromedioQq: null,
      precioPromedioKg: null,
      sinLiquidarPct: 0,
    });
    expect(r.porProveedor).toEqual([]);
    expect(r.precioPorPeriodo).toEqual([]);
  });

  it('suma peso y compra, y el precio por quintal sale de compra ÷ quintales', () => {
    const r = calcularCompras(
      [
        entrega({ netWeight: 1000, costoPorKg: 2 }), // $2000
        entrega({ netWeight: 500, costoPorKg: 3 }), // $1500
      ],
      'dia',
    );
    expect(r.totales.pesoNetoKg).toBe(1500);
    expect(r.totales.pesoNetoQq).toBeCloseTo(1500 / KG_POR_QUINTAL, 2);
    expect(r.totales.compra).toBe(3500);
    // $3500 ÷ (1500 kg ÷ 45,359237) = $155,36 por quintal
    expect(r.totales.precioPromedioQq).toBe(
      Math.round((3500 / (1500 / KG_POR_QUINTAL)) * 100) / 100,
    );
    expect(r.totales.precioPromedioKg).toBeCloseTo(3500 / 1500, 4);
  });

  it('cuenta las entregas por estado y el porcentaje sin liquidar', () => {
    const r = calcularCompras(
      [
        entrega(),
        entrega({ liquidadoKg: 300 }),
        entrega({ liquidadoKg: 1000 }),
        entrega({ closedAt: new Date() }),
      ],
      'dia',
    );
    expect(r.totales).toMatchObject({
      entregas: 4,
      sinLiquidar: 1,
      parciales: 1,
      liquidadas: 1,
      cerradas: 1,
      sinLiquidarPct: 25,
    });
  });

  it('agrupa por proveedor ordenado por compra y reparte el porcentaje', () => {
    const r = calcularCompras(
      [
        entrega({
          supplierId: 1,
          supplierName: 'A',
          netWeight: 100,
          costoPorKg: 2,
        }), // 200
        entrega({
          supplierId: 2,
          supplierName: 'B',
          netWeight: 300,
          costoPorKg: 2,
        }), // 600
        entrega({
          supplierId: 1,
          supplierName: 'A',
          netWeight: 100,
          costoPorKg: 2,
          liquidadoKg: 100,
        }), // +200
      ],
      'dia',
    );
    expect(r.porProveedor.map((p) => p.nombre)).toEqual(['B', 'A']);
    expect(r.porProveedor[0]).toMatchObject({
      entregas: 1,
      compra: 600,
      pctCompra: 60,
      sinLiquidar: 1,
    });
    expect(r.porProveedor[1]).toMatchObject({
      entregas: 2,
      compra: 400,
      pctCompra: 40,
      sinLiquidar: 1,
    });
  });

  it('agrupa por calidad y pone «Sin calidad» a lo que no la tiene', () => {
    const r = calcularCompras(
      [
        entrega({ qualityName: 'CCN-51', netWeight: 100 }),
        entrega({ qualityName: null, netWeight: 50 }),
      ],
      'dia',
    );
    expect(r.porCalidad.map((c) => c.nombre)).toEqual([
      'CCN-51',
      'Sin calidad',
    ]);
  });

  it('precio por día: cada día pesa el precio por el peso de sus entregas', () => {
    const r = calcularCompras(
      [
        entrega({
          date: new Date('2026-10-05T00:00:00.000Z'),
          netWeight: 100,
          costoPorKg: 2,
        }),
        entrega({
          date: new Date('2026-10-05T00:00:00.000Z'),
          netWeight: 300,
          costoPorKg: 4,
        }),
        entrega({
          date: new Date('2026-10-06T00:00:00.000Z'),
          netWeight: 100,
          costoPorKg: 3,
        }),
      ],
      'dia',
    );
    expect(r.agrupadoPor).toBe('dia');
    expect(r.precioPorPeriodo.map((p) => p.clave)).toEqual([
      '2026-10-05',
      '2026-10-06',
    ]);
    // día 5: (100×2 + 300×4) = 1400 sobre 400 kg → 3,5 $/kg
    expect(r.precioPorPeriodo[0].precioQq).toBeCloseTo(3.5 * KG_POR_QUINTAL, 1);
  });

  it('agrupa por semana (empieza el lunes) cuando el periodo es largo', () => {
    const r = calcularCompras(
      [
        // lunes 26/10, miércoles 28/10 y domingo 01/11 son la misma semana; el lunes 02/11 es otra
        entrega({ date: new Date('2026-10-26T00:00:00.000Z') }),
        entrega({ date: new Date('2026-10-28T00:00:00.000Z') }),
        entrega({ date: new Date('2026-11-01T00:00:00.000Z') }),
        entrega({ date: new Date('2026-11-02T00:00:00.000Z') }),
      ],
      'semana',
    );
    expect(r.agrupadoPor).toBe('semana');
    expect(r.precioPorPeriodo.map((p) => p.clave)).toEqual([
      '2026-10-26',
      '2026-11-02',
    ]);
    expect(r.precioPorPeriodo[0].pesoNetoKg).toBe(3000);
  });
});
