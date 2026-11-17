import type { ProductComputation, QuoteComputation } from '../../../utils/cotizador/pricing';
import type { QuoteDraft } from '../../../utils/cotizador/draft';
import HojaCotizacion, { type HojaBloque, type HojaFilaProducto } from './HojaCotizacion';

interface Props {
  draft: QuoteDraft;
  comp: QuoteComputation;
  companyName: string;
  logoUrl?: string | null;
  issuerName: string;
  issuerRole: string;
  /** Teléfono de quien emite (ya con el de respaldo aplicado). */
  issuerPhone: string;
}

// Lo que se imprime / guarda como PDF desde el Cotizador. El diseño vive en HojaCotizacion.tsx, que comparte
// con el enlace del cliente para que los dos PDF salgan iguales. Aquí solo se pasan PRECIOS DE VENTA:
// "Costo unit." y "Costo total" son los precios de venta (sin IVA), igual que el cotizador original; nunca
// el costo del proveedor, la ganancia ni el nombre del proveedor.
export default function QuotePrint({ draft, comp, companyName, logoUrl, issuerName, issuerRole, issuerPhone }: Props) {
  const fila = (c: ProductComputation): HojaFilaProducto | null =>
    c.missing || !c.item || !c.price
      ? null
      : {
          codigo: c.item.code,
          nombre: c.item.name,
          unidad: c.item.unit || '',
          precioUnitario: c.price.priceBeforeIva,
          cantidad: c.line.qty,
          total: c.pvpTotal,
          admiteInstalacion: c.item.hasInstalacion,
          instalacionIncluida: c.line.installActive,
        };

  const bloques: HojaBloque[] = [];
  for (const l of comp.lines) {
    if (l.kind === 'kit') {
      bloques.push({
        tipo: 'kit',
        nombre: l.line.kitName,
        cantidad: l.line.qty,
        filas: l.comps.map(fila).filter((f): f is HojaFilaProducto => f !== null),
      });
    } else if (l.kind === 'product') {
      const f = fila(l);
      if (f) bloques.push({ tipo: 'producto', fila: f });
    }
  }

  return (
    <HojaCotizacion
      d={{
        empresa: companyName,
        logoUrl,
        numero: draft.quoteNumber,
        fecha: draft.quoteDate,
        cliente: draft.client,
        bloques,
        custodias: comp.lines.flatMap((l) =>
          l.kind === 'custodia'
            ? [
                {
                  descripcion: l.line.description,
                  categoria: '',
                  subcategoria: '',
                  precioUnitario: l.line.resultado.precioSinIva,
                  cantidad: l.line.qty,
                  total: l.pvpTotal,
                },
              ]
            : [],
        ),
        instalaciones: comp.lines.flatMap((l) =>
          l.kind === 'install'
            ? [
                {
                  descripcion: l.line.description,
                  categoria: l.line.category,
                  subcategoria: l.line.subcategory,
                  precioUnitario: l.line.qty > 0 ? l.pvpTotal / l.line.qty : 0,
                  cantidad: l.line.qty,
                  total: l.pvpTotal,
                },
              ]
            : [],
        ),
        totales: comp.totals,
        discountType: draft.discountType,
        discountValue: draft.discountValue,
        condiciones: draft.conditions,
        notas: draft.notes,
        emisor: { nombre: issuerName, cargo: issuerRole, telefono: issuerPhone },
      }}
    />
  );
}
