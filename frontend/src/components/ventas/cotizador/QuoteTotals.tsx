import type { QuoteTotals as Totals } from '../../../utils/cotizador/pricing';
import type { DiscountType } from '../../../utils/cotizador/types';
import { money } from '../../../utils/cotizador/format';

interface Props {
  totals: Totals;
  discountType: DiscountType;
  discountValue: number;
  /** Id del elemento del total (solo la versión de pantalla lo lleva: la de impresión repetiría el id). */
  totalId?: string;
}

// Mismo desglose que la pantalla y el PDF del cotizador original.
export default function QuoteTotals({ totals, discountType, discountValue, totalId }: Props) {
  const hasDiscount = totals.discount > 0;
  return (
    <div className="cot-totals" aria-label="Totales de la cotización">
      <div className="row detail">
        <span>Productos</span>
        <span>{money(totals.subtotalEquipo)}</span>
      </div>
      {totals.totalInstSinIva > 0 && (
        <div className="row detail">
          <span>Instalaciones</span>
          <span>{money(totals.totalInstSinIva)}</span>
        </div>
      )}
      {hasDiscount && (
        <>
          <div className="row base">
            <span>Costo base total</span>
            <span>{money(totals.base)}</span>
          </div>
          <div className="row discount">
            <span>{discountType === 'percent' ? `Descuento (${discountValue}%)` : 'Descuento'}</span>
            <span>-{money(totals.discount)}</span>
          </div>
        </>
      )}
      <div className={`row ${hasDiscount ? '' : 'base'}`}>
        <span>Subtotal</span>
        <span>{money(totals.subtotal)}</span>
      </div>
      <div className="row">
        <span>IVA 15%</span>
        <span>{money(totals.iva)}</span>
      </div>
      <div className="row total">
        <span>TOTAL</span>
        <span id={totalId}>{money(totals.total)}</span>
      </div>
    </div>
  );
}
