import { describe, expect, it } from 'vitest';
import {
  antiguedad, hoyComoDia, inventarioPorCalidad, totalesAntiguedad, tramoDeVencimiento, ventasPorCliente,
} from './reportes.util';

// Hoy = 27/10/2026
const HOY = Date.UTC(2026, 9, 27);
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('tramoDeVencimiento', () => {
  it('lo que vence hoy o después está al día', () => {
    expect(tramoDeVencimiento(dia('2026-10-27'), HOY)).toBe('alDia');
    expect(tramoDeVencimiento(dia('2026-12-31'), HOY)).toBe('alDia');
  });

  it('cuenta los días vencidos en tramos de 30', () => {
    expect(tramoDeVencimiento(dia('2026-10-26'), HOY)).toBe('d1_30'); // 1 día
    expect(tramoDeVencimiento(dia('2026-09-27'), HOY)).toBe('d1_30'); // 30 días
    expect(tramoDeVencimiento(dia('2026-09-26'), HOY)).toBe('d31_60'); // 31 días
    expect(tramoDeVencimiento(dia('2026-08-28'), HOY)).toBe('d31_60'); // 60 días
    expect(tramoDeVencimiento(dia('2026-08-27'), HOY)).toBe('d61_90'); // 61 días
    expect(tramoDeVencimiento(dia('2026-07-29'), HOY)).toBe('d61_90'); // 90 días
    expect(tramoDeVencimiento(dia('2026-07-28'), HOY)).toBe('d90'); // 91 días
  });

  it('acepta la fecha como texto ISO del servidor y no le afecta la hora', () => {
    expect(tramoDeVencimiento('2026-10-26T23:59:59.999Z', HOY)).toBe('d1_30');
  });
});

describe('hoyComoDia', () => {
  it('toma el día local de quien mira, sin hora', () => {
    expect(hoyComoDia(new Date(2026, 9, 27, 23, 30))).toBe(HOY);
  });
});

describe('antiguedad', () => {
  it('suma el saldo por persona y tramo, ordenado por lo vencido', () => {
    const filas = antiguedad(
      [
        { nombre: 'A', saldo: 100, vence: dia('2026-11-10') }, // al día
        { nombre: 'A', saldo: 50, vence: dia('2026-10-01') }, // 26 días
        { nombre: 'B', saldo: 300, vence: dia('2026-06-01') }, // +90
        { nombre: 'C', saldo: 40, vence: dia('2026-11-01') }, // al día
      ],
      HOY,
    );
    expect(filas.map((f) => f.nombre)).toEqual(['B', 'A', 'C']);
    expect(filas[1]).toMatchObject({ nombre: 'A', cuentas: 2, total: 150, alDia: 100, d1_30: 50, vencido: 50 });
    expect(filas[0]).toMatchObject({ d90: 300, vencido: 300 });
  });

  it('ignora cuentas sin saldo', () => {
    const filas = antiguedad(
      [
        { nombre: 'A', saldo: 0, vence: dia('2026-01-01') },
        { nombre: 'A', saldo: 0.004, vence: dia('2026-01-01') },
        { nombre: 'B', saldo: -5, vence: dia('2026-01-01') },
      ],
      HOY,
    );
    expect(filas).toEqual([]);
  });

  it('los totales cuadran con la suma de las filas', () => {
    const filas = antiguedad(
      [
        { nombre: 'A', saldo: 100.1, vence: dia('2026-11-10') },
        { nombre: 'B', saldo: 200.2, vence: dia('2026-06-01') },
      ],
      HOY,
    );
    expect(totalesAntiguedad(filas)).toMatchObject({ cuentas: 2, total: 300.3, vencido: 200.2, alDia: 100.1, d90: 200.2 });
  });
});

describe('ventasPorCliente', () => {
  const embarques = [
    { cliente: 'X', fecha: dia('2026-10-20'), kg: 1000, precioKg: 3, costo: 2000 }, // venta 3000
    { cliente: 'X', fecha: dia('2026-10-22'), kg: 500, precioKg: 4, costo: 1000 }, // venta 2000
    { cliente: 'Y', fecha: dia('2026-05-01'), kg: 100, precioKg: 2, costo: 150 }, // antiguo
  ];

  it('suma venta, costo y margen por cliente y calcula el margen %', () => {
    const f = ventasPorCliente(embarques, null);
    expect(f.map((r) => r.cliente)).toEqual(['X', 'Y']);
    expect(f[0]).toMatchObject({ embarques: 2, kg: 1500, venta: 5000, costo: 3000, margen: 2000, margenPct: 66.7 });
  });

  it('respeta la fecha desde', () => {
    const f = ventasPorCliente(embarques, Date.UTC(2026, 9, 1));
    expect(f.map((r) => r.cliente)).toEqual(['X']);
  });

  it('sin costo no inventa un margen %', () => {
    const f = ventasPorCliente([{ cliente: 'Z', fecha: dia('2026-10-20'), kg: 10, precioKg: 2, costo: 0 }], null);
    expect(f[0].margenPct).toBeNull();
  });
});

describe('inventarioPorCalidad', () => {
  it('agrupa por calidad con costo promedio ponderado y sin lotes en cero', () => {
    const f = inventarioPorCalidad([
      { calidad: 'A', kg: 100, costoPorKg: 2 }, // 200
      { calidad: 'A', kg: 300, costoPorKg: 4 }, // 1200
      { calidad: 'B', kg: 50, costoPorKg: 10 }, // 500
      { calidad: 'B', kg: 0, costoPorKg: 99 }, // se ignora
    ]);
    expect(f.map((r) => r.calidad)).toEqual(['A', 'B']);
    expect(f[0]).toMatchObject({ lotes: 2, kg: 400, valor: 1400, costoPromedioKg: 3.5 });
    expect(f[1]).toMatchObject({ lotes: 1, kg: 50, valor: 500 });
  });
});
