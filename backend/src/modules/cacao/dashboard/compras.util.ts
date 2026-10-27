import { KG_POR_QUINTAL } from '../unit-config/unit-config.service';

const TOLERANCIA_KG = 0.001;

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Lo que el dashboard necesita saber de cada entrega recibida en el periodo. */
export interface RecepcionCompra {
  date: Date;
  supplierId: number;
  supplierName: string;
  qualityName: string | null;
  /** Peso neto recibido, en kg. */
  netWeight: number;
  /** Costo por kg del lote (el precio ya fijado o el provisional). */
  costoPorKg: number;
  /** Kilos ya liquidados al proveedor. */
  liquidadoKg: number;
  closedAt: Date | null;
}

export type EstadoEntrega =
  'SIN_LIQUIDAR' | 'PARCIAL' | 'LIQUIDADA' | 'CERRADA';

export function estadoEntrega(
  r: Pick<RecepcionCompra, 'netWeight' | 'liquidadoKg' | 'closedAt'>,
): EstadoEntrega {
  if (r.closedAt) return 'CERRADA';
  if (r.liquidadoKg <= TOLERANCIA_KG) return 'SIN_LIQUIDAR';
  if (r.liquidadoKg < r.netWeight - TOLERANCIA_KG) return 'PARCIAL';
  return 'LIQUIDADA';
}

/** `2026-10-27` (día UTC: la fecha de una recepción se guarda como día, sin hora). */
const claveDia = (d: Date) => d.toISOString().slice(0, 10);

/** Lunes de la semana de esa fecha, como `2026-10-26`. */
function claveSemana(d: Date): string {
  const lunes = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const diaSemana = (lunes.getUTCDay() + 6) % 7; // lunes = 0
  lunes.setUTCDate(lunes.getUTCDate() - diaSemana);
  return claveDia(lunes);
}

/**
 * Resumen de compras de un periodo: cifras totales, por proveedor, por calidad y precio promedio
 * por quintal a lo largo del tiempo. La compra de cada entrega es su peso neto por el costo del
 * lote; no es lo liquidado (eso lo mira «Liquidación»).
 */
export function calcularCompras(
  recepciones: RecepcionCompra[],
  agrupar: 'dia' | 'semana',
) {
  const compraDe = (r: RecepcionCompra) => r.netWeight * r.costoPorKg;
  const quintales = (kg: number) => kg / KG_POR_QUINTAL;

  const pesoNetoKg = recepciones.reduce((s, r) => s + r.netWeight, 0);
  const compra = recepciones.reduce((s, r) => s + compraDe(r), 0);

  const estados = { SIN_LIQUIDAR: 0, PARCIAL: 0, LIQUIDADA: 0, CERRADA: 0 };
  for (const r of recepciones) estados[estadoEntrega(r)]++;

  const totales = {
    entregas: recepciones.length,
    pesoNetoKg: round4(pesoNetoKg),
    pesoNetoQq: round2(quintales(pesoNetoKg)),
    compra: round2(compra),
    precioPromedioQq:
      pesoNetoKg > 0 ? round2(compra / quintales(pesoNetoKg)) : null,
    precioPromedioKg: pesoNetoKg > 0 ? round4(compra / pesoNetoKg) : null,
    sinLiquidar: estados.SIN_LIQUIDAR,
    sinLiquidarPct:
      recepciones.length > 0
        ? round1((estados.SIN_LIQUIDAR / recepciones.length) * 100)
        : 0,
    parciales: estados.PARCIAL,
    liquidadas: estados.LIQUIDADA,
    cerradas: estados.CERRADA,
  };

  const porProveedorMapa = new Map<
    number,
    {
      nombre: string;
      entregas: number;
      kg: number;
      compra: number;
      sinLiquidar: number;
    }
  >();
  const porCalidadMapa = new Map<string, { kg: number; compra: number }>();
  const porPeriodoMapa = new Map<string, { kg: number; compra: number }>();

  for (const r of recepciones) {
    const p = porProveedorMapa.get(r.supplierId) ?? {
      nombre: r.supplierName,
      entregas: 0,
      kg: 0,
      compra: 0,
      sinLiquidar: 0,
    };
    p.entregas++;
    p.kg += r.netWeight;
    p.compra += compraDe(r);
    if (estadoEntrega(r) === 'SIN_LIQUIDAR') p.sinLiquidar++;
    porProveedorMapa.set(r.supplierId, p);

    const nombreCalidad = r.qualityName ?? 'Sin calidad';
    const c = porCalidadMapa.get(nombreCalidad) ?? { kg: 0, compra: 0 };
    c.kg += r.netWeight;
    c.compra += compraDe(r);
    porCalidadMapa.set(nombreCalidad, c);

    const clave = agrupar === 'semana' ? claveSemana(r.date) : claveDia(r.date);
    const t = porPeriodoMapa.get(clave) ?? { kg: 0, compra: 0 };
    t.kg += r.netWeight;
    t.compra += compraDe(r);
    porPeriodoMapa.set(clave, t);
  }

  const porProveedor = [...porProveedorMapa.entries()]
    .map(([supplierId, p]) => ({
      supplierId,
      nombre: p.nombre,
      entregas: p.entregas,
      pesoNetoKg: round4(p.kg),
      pesoNetoQq: round2(quintales(p.kg)),
      compra: round2(p.compra),
      precioPromedioQq: p.kg > 0 ? round2(p.compra / quintales(p.kg)) : null,
      pctCompra: compra > 0 ? round1((p.compra / compra) * 100) : 0,
      sinLiquidar: p.sinLiquidar,
    }))
    .sort((a, b) => b.compra - a.compra);

  const porCalidad = [...porCalidadMapa.entries()]
    .map(([nombre, c]) => ({
      nombre,
      pesoNetoKg: round4(c.kg),
      pesoNetoQq: round2(quintales(c.kg)),
      compra: round2(c.compra),
      pctCompra: compra > 0 ? round1((c.compra / compra) * 100) : 0,
    }))
    .sort((a, b) => b.compra - a.compra);

  const precioPorPeriodo = [...porPeriodoMapa.entries()]
    .map(([clave, t]) => ({
      clave,
      pesoNetoKg: round4(t.kg),
      precioQq: t.kg > 0 ? round2(t.compra / quintales(t.kg)) : null,
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave));

  return {
    agrupadoPor: agrupar,
    totales,
    porProveedor,
    porCalidad,
    precioPorPeriodo,
  };
}
