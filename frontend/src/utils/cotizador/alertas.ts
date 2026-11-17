// Avisos de precio bajo del Cotizador (2026-11-12). Lógica PURA, sin pantalla ni red.
// Solo AVISAN: nunca bloquean guardar ni enviar (decisión de Leidy: todavía no hay quien apruebe).
//
// Tres vigilantes, todos opcionales (vacío = sin límite):
//  1. Descuento máximo (en % de toda la cotización). Hay un límite para equipos, materiales e
//     instalaciones y otro, normalmente más estricto, para servicios. Si la cotización mezcla,
//     manda el más estricto de los que aplican.
//  2. Ganancia mínima (en % sobre el costo). Solo cuenta lo que lleva ganancia (equipos,
//     materiales e instalaciones): un servicio se vende a su costo y no suma ganancia.
//  3. Precio mínimo de cada producto o servicio (antes de IVA), puesto en el catálogo.
//
// El descuento de una cotización es uno solo para todo: se reparte proporcionalmente entre las
// líneas para saber a qué precio efectivo sale cada una.
import { r2 } from './pricing';
import type { CatalogMap, ProductComputation, QuoteComputation } from './pricing';

export interface CotLimites {
  maxDescuentoPct: number | null;
  maxDescuentoServiciosPct: number | null;
  minGananciaPct: number | null;
}

export const SIN_LIMITES: CotLimites = { maxDescuentoPct: null, maxDescuentoServiciosPct: null, minGananciaPct: null };

export type TipoAlerta = 'descuento' | 'ganancia' | 'minimo';

export interface AlertaPrecio {
  tipo: TipoAlerta;
  /** Frase corta para quien cotiza. */
  mensaje: string;
  /** Líneas de detalle (para el precio mínimo: qué productos). */
  detalle: string[];
}

const EPS = 0.005;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} %`;
const dinero = (n: number) => '$' + n.toFixed(2);

function productosDe(comp: QuoteComputation): ProductComputation[] {
  const out: ProductComputation[] = [];
  for (const l of comp.lines) {
    if (l.kind === 'product') out.push(l);
    else if (l.kind === 'kit') out.push(...l.comps);
  }
  return out.filter((p) => p.item && p.price && !p.missing);
}

export function calcularAlertas(comp: QuoteComputation, catalog: CatalogMap, limites: CotLimites | null): AlertaPrecio[] {
  if (!limites) return [];
  const { base, discount } = comp.totals;
  if (base <= 0) return [];
  const alertas: AlertaPrecio[] = [];
  const descuentoPct = (discount / base) * 100;
  // Proporción del precio que de verdad se cobra después del descuento.
  const factor = 1 - discount / base;

  const productos = productosDe(comp);
  const instalaciones = comp.lines.filter((l) => l.kind === 'install');
  const conServicios = productos.some((p) => p.item!.isService);
  const conOtros = productos.some((p) => !p.item!.isService) || instalaciones.length > 0;

  // 1) Descuento máximo
  const aplicables: { limite: number; deServicios: boolean }[] = [];
  if (conOtros && limites.maxDescuentoPct !== null) aplicables.push({ limite: limites.maxDescuentoPct, deServicios: false });
  if (conServicios && limites.maxDescuentoServiciosPct !== null) {
    aplicables.push({ limite: limites.maxDescuentoServiciosPct, deServicios: true });
  }
  if (aplicables.length > 0) {
    const manda = aplicables.reduce((a, b) => (b.limite < a.limite ? b : a));
    if (descuentoPct > manda.limite + EPS) {
      alertas.push({
        tipo: 'descuento',
        mensaje: `El descuento es ${pct(descuentoPct)} y el máximo permitido es ${pct(manda.limite)}${
          manda.deServicios && conOtros ? ' (esta cotización incluye servicios)' : manda.deServicios ? ' para servicios' : ''
        }.`,
        detalle: [],
      });
    }
  }

  // 2) Ganancia mínima, solo sobre lo que lleva ganancia
  if (limites.minGananciaPct !== null) {
    const noServicio = productos.filter((p) => !p.item!.isService);
    const costo = noServicio.reduce((s, p) => s + p.costTotal, 0) + instalaciones.reduce((s, l) => s + l.costTotal, 0);
    const venta = noServicio.reduce((s, p) => s + p.pvpTotal, 0) + instalaciones.reduce((s, l) => s + l.pvpTotal, 0);
    if (costo > 0) {
      const ganancia = ((venta * factor - costo) / costo) * 100;
      if (ganancia < limites.minGananciaPct - EPS) {
        alertas.push({
          tipo: 'ganancia',
          mensaje: `La ganancia de esta cotización es ${pct(ganancia)} sobre el costo y el mínimo es ${pct(limites.minGananciaPct)}.`,
          detalle: [],
        });
      }
    }
  }

  // 3) Precio mínimo de cada producto o servicio (antes de IVA, ya con el descuento)
  const bajos = new Map<string, string>();
  for (const p of productos) {
    const minimo = catalog.get(p.item!.code)?.minPrice ?? null;
    if (minimo === null || minimo <= 0) continue;
    const unitario = r2(p.price!.priceBeforeIva * factor);
    if (unitario < minimo - EPS && !bajos.has(p.item!.code)) {
      bajos.set(p.item!.code, `${p.item!.code} ${p.item!.name}: se vende a ${dinero(unitario)} y el mínimo es ${dinero(minimo)}`);
    }
  }
  if (bajos.size > 0) {
    alertas.push({
      tipo: 'minimo',
      mensaje: bajos.size === 1 ? 'Un producto queda por debajo de su precio mínimo (antes de IVA).' : `${bajos.size} productos quedan por debajo de su precio mínimo (antes de IVA).`,
      detalle: [...bajos.values()],
    });
  }
  return alertas;
}
