// Cálculo de precios del Cotizador EN EL SERVIDOR (2026-11-17).
//
// Es la copia fiel de frontend/src/utils/cotizador/pricing.ts (computeQuote), con las mismas reglas:
//   - Un producto se identifica por su CÓDIGO; si la línea guardó su precio (`snap`) y el catálogo cambió,
//     se usa el precio guardado (la cotización no se mueve).
//   - Equipos/materiales: costo + ganancia del proveedor (si «lleva ganancia»). Servicios: su costo.
//   - Instalaciones: costo + margen de instalación. Custodia móvil: su precio guardado.
//   - El descuento se resta ANTES del IVA; el IVA (15 %) se calcula una sola vez sobre el subtotal.
// Si cambia una regla allá, hay que cambiarla aquí (y su spec compara los dos con los mismos casos).
//
// Para qué existe: la página pública de la cotización (enlace al cliente) NO puede recibir costos ni
// márgenes, así que los precios finales se calculan aquí y a la página solo le llegan precios de venta.
import { toNum } from './cotizador.util';
import type { CotKitLine, CotLine, CotProductLine } from './cotizador.util';

export const IVA_RATE = 0.15;
export const DEFAULT_SUPPLIER_MARGIN = 15;
export const SIN_PROVEEDOR = 'Sin proveedor';

export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Lo que el cálculo necesita de un producto del catálogo (CotProduct de Prisma o ya mapeado). */
export interface ProductoCatalogo {
  code: string;
  kind: string;
  name: string;
  unit: string;
  /** Solo equipos: modelo (ej. DS-X). La hoja impresa lo muestra en lugar del código. */
  model?: string;
  unitCost: unknown;
  monthlyCost: unknown;
  annualCost: unknown;
  hasProfit: boolean;
  hasInstall: boolean;
  supplier: string;
}

interface PriceItem {
  code: string;
  name: string;
  unit: string;
  model: string;
  cost: number;
  hasGanancia: boolean;
  hasInstalacion: boolean;
  isService: boolean;
  supplier: string;
}

function serviceCost(p: ProductoCatalogo): number {
  const mensual = toNum(p.monthlyCost);
  const anual = toNum(p.annualCost);
  const unitario = toNum(p.unitCost);
  if (mensual > 0) return mensual;
  if (anual > 0) return r2(anual / 12);
  return unitario > 0 ? unitario : 0;
}

function toPriceItem(p: ProductoCatalogo): PriceItem {
  const isService = p.kind === 'SERVICIO';
  return {
    code: p.code,
    name: p.name,
    unit: p.unit || '',
    model: p.kind === 'EQUIPO' ? p.model || '' : '',
    cost: isService ? serviceCost(p) : toNum(p.unitCost),
    hasGanancia: isService ? false : p.hasProfit,
    hasInstalacion: isService ? false : p.hasInstall,
    isService,
    supplier: p.kind === 'EQUIPO' ? p.supplier || '' : '',
  };
}

function priceDiffers(item: PriceItem, snap: CotProductLine['snap']): boolean {
  if (!snap || typeof snap.cost !== 'number') return false;
  return (
    Math.abs(item.cost - snap.cost) > 0.0005 ||
    item.hasGanancia !== !!snap.hasGanancia ||
    item.hasInstalacion !== !!snap.hasInstalacion ||
    item.isService !== !!snap.isService ||
    item.supplier !== (snap.supplier || '')
  );
}

function calcDiscount(base: number, type: string, value: number): number {
  if (type === 'percent' && value > 0) {
    const pct = Math.min(100, Math.max(0, value));
    return r2(base * (pct / 100));
  }
  if (type === 'fixed' && value > 0) {
    return Math.min(Math.max(0, value), Math.max(0, base));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Resultado: SOLO precios de venta (nada de costos, márgenes ni proveedores)
// ---------------------------------------------------------------------------

/** Una fila de producto tal como la ve el cliente. */
export interface FilaProductoVenta {
  codigo: string;
  nombre: string;
  /** Modelo del equipo (vacío en materiales y servicios): se imprime en lugar del código. */
  modelo: string;
  unidad: string;
  /** Precio de venta unitario sin IVA. */
  precioUnitario: number;
  cantidad: number;
  /** En un kit: la cantidad de este producto POR kit (la que imprime el PDF de la app). Fuera de un kit = cantidad. */
  cantidadEnKit: number;
  /** precioUnitario × cantidad, sin IVA. */
  total: number;
  /** El producto admite instalación (columna «Inst»). */
  admiteInstalacion: boolean;
  /** La instalación está incluida en esta línea. */
  instalacionIncluida: boolean;
}

export type BloqueVenta =
  | { tipo: 'producto'; fila: FilaProductoVenta }
  | {
      tipo: 'kit';
      nombre: string;
      cantidad: number;
      filas: FilaProductoVenta[];
      total: number;
    };

export interface FilaServicioVenta {
  descripcion: string;
  detalle: string;
  /** Solo instalaciones: categoría y subcategoría (el PDF las imprime entre paréntesis). */
  categoria: string;
  subcategoria: string;
  precioUnitario: number;
  cantidad: number;
  total: number;
}

export interface TotalesVenta {
  productos: number;
  instalaciones: number;
  custodia: number;
  /** Productos + instalaciones + custodia, antes del descuento y del IVA. */
  base: number;
  descuento: number;
  subtotal: number;
  iva: number;
  total: number;
}

export interface CotizacionVenta {
  bloques: BloqueVenta[];
  custodias: FilaServicioVenta[];
  instalaciones: FilaServicioVenta[];
  totales: TotalesVenta;
}

export interface EntradaPrecios {
  items: CotLine[];
  catalogo: ReadonlyMap<string, ProductoCatalogo>;
  supplierMargins: Record<string, number>;
  installMargin: number;
  discountType: string;
  discountValue: number;
}

const esKit = (l: CotLine): l is CotKitLine => 'isKit' in l && l.isKit === true;
const esInstalacion = (l: CotLine) =>
  'isInstallService' in l && l.isInstallService === true;
const esCustodia = (l: CotLine) => 'isCustodia' in l && l.isCustodia === true;

/** null = el producto ya no existe en el catálogo (igual que el PDF: esa línea no se muestra). */
function filaProducto(
  line: CotProductLine,
  e: EntradaPrecios,
  multiplicador: number,
): FilaProductoVenta | null {
  const p = e.catalogo.get(line.code);
  if (!p) return null;
  let item = toPriceItem(p);
  if (line.snap && priceDiffers(item, line.snap)) {
    item = {
      ...item,
      cost: line.snap.cost,
      hasGanancia: !!line.snap.hasGanancia,
      hasInstalacion: !!line.snap.hasInstalacion,
      isService: !!line.snap.isService,
      supplier: line.snap.supplier || '',
    };
  }
  const margen =
    line.customMargin ??
    e.supplierMargins[item.supplier || SIN_PROVEEDOR] ??
    DEFAULT_SUPPLIER_MARGIN;
  const ganancia =
    !item.isService && item.hasGanancia ? r2(item.cost * (margen / 100)) : 0;
  const precio = item.cost + ganancia;
  const cantidad = (line.qty ?? 1) * multiplicador;
  return {
    codigo: item.code,
    nombre: item.name,
    modelo: item.model,
    unidad: item.unit,
    precioUnitario: precio,
    cantidad,
    cantidadEnKit: line.qty ?? 1,
    total: precio * cantidad,
    admiteInstalacion: item.hasInstalacion,
    instalacionIncluida: item.hasInstalacion && !!line.installActive,
  };
}

/**
 * Calcula la cotización con los mismos números que la pantalla y el PDF, y devuelve SOLO lo que se le
 * puede mostrar a un cliente. Los importes van redondeados a centavos al final (no antes), como en pantalla.
 */
export function calcularCotizacionVenta(e: EntradaPrecios): CotizacionVenta {
  const bloques: BloqueVenta[] = [];
  const custodias: FilaServicioVenta[] = [];
  const instalaciones: FilaServicioVenta[] = [];
  let productos = 0;
  let totalInst = 0;
  let totalCustodia = 0;

  for (const line of e.items) {
    if (esCustodia(line)) {
      const l = line as Extract<CotLine, { isCustodia: true }>;
      const cantidad = l.qty || 1;
      const unit = toNum(l.resultado?.precioSinIva);
      totalCustodia += unit * cantidad;
      custodias.push({
        descripcion: l.description,
        detalle: '',
        categoria: '',
        subcategoria: '',
        precioUnitario: unit,
        cantidad,
        total: unit * cantidad,
      });
      continue;
    }
    if (esInstalacion(line)) {
      const l = line as Extract<CotLine, { isInstallService: true }>;
      const costo = (l.customCost ?? l.cost) || 0;
      const margen = l.customMargin ?? e.installMargin;
      const unit = costo + r2(costo * (margen / 100));
      const cantidad = l.qty || 1;
      totalInst += unit * cantidad;
      instalaciones.push({
        descripcion: l.description,
        detalle: [l.category, l.subcategory].filter(Boolean).join(' › '),
        categoria: l.category,
        subcategoria: l.subcategory,
        precioUnitario: unit,
        cantidad,
        total: unit * cantidad,
      });
      continue;
    }
    if (esKit(line)) {
      const filas = (line.kitComponents ?? [])
        .map((c) => filaProducto(c, e, line.qty || 1))
        .filter((f): f is FilaProductoVenta => f !== null);
      const total = filas.reduce((s, f) => s + f.total, 0);
      productos += total;
      bloques.push({
        tipo: 'kit',
        nombre: line.kitName,
        cantidad: line.qty || 1,
        filas,
        total,
      });
      continue;
    }
    const fila = filaProducto(line as CotProductLine, e, 1);
    if (!fila) continue;
    productos += fila.total;
    bloques.push({ tipo: 'producto', fila });
  }

  const base = productos + totalInst + totalCustodia;
  const descuento = calcDiscount(base, e.discountType, e.discountValue);
  const subtotal = base - descuento;
  const iva = r2(subtotal * IVA_RATE);
  const total = Math.max(0, Number((subtotal + iva).toFixed(2)));

  const fila2 = (f: FilaProductoVenta): FilaProductoVenta => ({
    ...f,
    precioUnitario: r2(f.precioUnitario),
    total: r2(f.total),
  });
  const serv2 = (f: FilaServicioVenta): FilaServicioVenta => ({
    ...f,
    precioUnitario: r2(f.precioUnitario),
    total: r2(f.total),
  });

  return {
    bloques: bloques.map((b) =>
      b.tipo === 'producto'
        ? { tipo: 'producto', fila: fila2(b.fila) }
        : { ...b, filas: b.filas.map(fila2), total: r2(b.total) },
    ),
    custodias: custodias.map(serv2),
    instalaciones: instalaciones.map(serv2),
    totales: {
      productos: r2(productos),
      instalaciones: r2(totalInst),
      custodia: r2(totalCustodia),
      base: r2(base),
      descuento: r2(descuento),
      subtotal: r2(subtotal),
      iva,
      total,
    },
  };
}
