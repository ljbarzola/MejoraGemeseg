/**
 * Cálculos de los reportes de Cacao (antigüedad de cuentas, ventas por cliente, inventario por
 * calidad). Son funciones puras: reciben lo que ya devuelve el servidor y no tocan la red.
 */

export type TramoKey = 'alDia' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90';

export const TRAMOS: { key: TramoKey; label: string }[] = [
  { key: 'alDia', label: 'Al día' },
  { key: 'd1_30', label: 'Vencido 1–30 días' },
  { key: 'd31_60', label: 'Vencido 31–60 días' },
  { key: 'd61_90', label: 'Vencido 61–90 días' },
  { key: 'd90', label: 'Vencido +90 días' },
];

const DIA_MS = 24 * 60 * 60 * 1000;
const TOLERANCIA = 0.005;

/** Día (sin hora) de una fecha, contado como día UTC: las fechas de vencimiento se guardan como día. */
const diaUtc = (d: Date | string) => {
  const f = new Date(d);
  return Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
};

/** El día de hoy de quien mira (hora local), puesto como día UTC para compararlo con las fechas guardadas. */
export const hoyComoDia = (ahora: Date = new Date()) => Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

/** En qué tramo cae un saldo según cuántos días lleva vencido. Vence hoy o más adelante: «al día». */
export function tramoDeVencimiento(vence: Date | string, hoy: number): TramoKey {
  const vencidos = Math.floor((hoy - diaUtc(vence)) / DIA_MS);
  if (vencidos <= 0) return 'alDia';
  if (vencidos <= 30) return 'd1_30';
  if (vencidos <= 60) return 'd31_60';
  if (vencidos <= 90) return 'd61_90';
  return 'd90';
}

export interface CuentaPendiente {
  /** A quién se le debe o quién debe (proveedor o cliente). */
  nombre: string;
  /** Lo que falta por pagar o cobrar. */
  saldo: number;
  vence: Date | string;
}

export interface FilaAntiguedad {
  nombre: string;
  cuentas: number;
  total: number;
  vencido: number;
  alDia: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Saldo pendiente por persona y tramo de vencimiento. Ignora lo que ya no tiene saldo. */
export function antiguedad(cuentas: CuentaPendiente[], hoy: number): FilaAntiguedad[] {
  const porNombre = new Map<string, FilaAntiguedad>();
  for (const c of cuentas) {
    if (!(c.saldo > TOLERANCIA)) continue;
    const fila = porNombre.get(c.nombre) ?? {
      nombre: c.nombre, cuentas: 0, total: 0, vencido: 0, alDia: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0,
    };
    const tramo = tramoDeVencimiento(c.vence, hoy);
    fila.cuentas++;
    fila.total += c.saldo;
    fila[tramo] += c.saldo;
    if (tramo !== 'alDia') fila.vencido += c.saldo;
    porNombre.set(c.nombre, fila);
  }
  return [...porNombre.values()]
    .map((f) => ({
      ...f,
      total: round2(f.total), vencido: round2(f.vencido), alDia: round2(f.alDia),
      d1_30: round2(f.d1_30), d31_60: round2(f.d31_60), d61_90: round2(f.d61_90), d90: round2(f.d90),
    }))
    .sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

export function totalesAntiguedad(filas: FilaAntiguedad[]) {
  const suma = (k: keyof FilaAntiguedad) => round2(filas.reduce((s, f) => s + (f[k] as number), 0));
  return {
    cuentas: filas.reduce((s, f) => s + f.cuentas, 0),
    total: suma('total'), vencido: suma('vencido'), alDia: suma('alDia'),
    d1_30: suma('d1_30'), d31_60: suma('d31_60'), d61_90: suma('d61_90'), d90: suma('d90'),
  };
}

export interface EmbarqueVenta {
  cliente: string;
  fecha: Date | string;
  /** Kilos embarcados. */
  kg: number;
  /** Precio de venta en $/kg. */
  precioKg: number;
  /** Costo total del embarque en $. */
  costo: number;
}

export interface FilaVentaCliente {
  cliente: string;
  embarques: number;
  kg: number;
  venta: number;
  costo: number;
  margen: number;
  margenPct: number | null;
}

/** Ventas por cliente desde una fecha (o todo el historial si `desde` es null). */
export function ventasPorCliente(embarques: EmbarqueVenta[], desde: number | null): FilaVentaCliente[] {
  const porCliente = new Map<string, { embarques: number; kg: number; venta: number; costo: number }>();
  for (const e of embarques) {
    if (desde !== null && diaUtc(e.fecha) < desde) continue;
    const f = porCliente.get(e.cliente) ?? { embarques: 0, kg: 0, venta: 0, costo: 0 };
    f.embarques++;
    f.kg += e.kg;
    f.venta += e.kg * e.precioKg;
    f.costo += e.costo;
    porCliente.set(e.cliente, f);
  }
  return [...porCliente.entries()]
    .map(([cliente, f]) => ({
      cliente,
      embarques: f.embarques,
      kg: Math.round(f.kg * 10000) / 10000,
      venta: round2(f.venta),
      costo: round2(f.costo),
      margen: round2(f.venta - f.costo),
      margenPct: f.costo > 0 ? Math.round(((f.venta / f.costo - 1) * 100) * 10) / 10 : null,
    }))
    .sort((a, b) => b.venta - a.venta);
}

export interface LoteInventario {
  calidad: string;
  kg: number;
  costoPorKg: number;
}

export interface FilaInventarioCalidad {
  calidad: string;
  lotes: number;
  kg: number;
  valor: number;
  costoPromedioKg: number | null;
}

/** Inventario abierto agrupado por calidad: kilos, valor y costo promedio ponderado. Ignora lotes en cero. */
export function inventarioPorCalidad(lotes: LoteInventario[]): FilaInventarioCalidad[] {
  const porCalidad = new Map<string, { lotes: number; kg: number; valor: number }>();
  for (const l of lotes) {
    if (!(l.kg > 0)) continue;
    const f = porCalidad.get(l.calidad) ?? { lotes: 0, kg: 0, valor: 0 };
    f.lotes++;
    f.kg += l.kg;
    f.valor += l.kg * l.costoPorKg;
    porCalidad.set(l.calidad, f);
  }
  return [...porCalidad.entries()]
    .map(([calidad, f]) => ({
      calidad,
      lotes: f.lotes,
      kg: Math.round(f.kg * 10000) / 10000,
      valor: round2(f.valor),
      costoPromedioKg: f.kg > 0 ? Math.round((f.valor / f.kg) * 10000) / 10000 : null,
    }))
    .sort((a, b) => b.valor - a.valor);
}
