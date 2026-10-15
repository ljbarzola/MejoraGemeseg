import type { CotProduct } from '../../../utils/cotizador/types';
import { calcItemPrice, getSupplierMargin, toPriceItem } from '../../../utils/cotizador/pricing';
import { isoToDMY, money } from '../../../utils/cotizador/format';

interface Props {
  product: CotProduct;
  supplierMargins: Record<string, number>;
  installMargin: number;
  onClose: () => void;
}

const KIND_LABEL = { EQUIPO: 'Equipo', MATERIAL: 'Material', SERVICIO: 'Servicio' } as const;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 10px 4px 0', color: '#718096', fontSize: 12 }}>{k}</td>
      <td style={{ padding: '4px 0', fontWeight: 600 }}>{v || '—'}</td>
    </tr>
  );
}

export default function ProductDetailModal({ product: p, supplierMargins, installMargin, onClose }: Props) {
  const item = toPriceItem(p);
  const price = calcItemPrice(item, {
    supplierMargin: getSupplierMargin(supplierMargins, item.supplier),
    installMargin,
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-pd-title"
      >
        <div className="modal-header">
          <h3 id="cot-pd-title">{p.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <table>
            <tbody>
              <Row k="Código" v={p.code} />
              <Row k="Tipo" v={KIND_LABEL[p.kind]} />
              <Row k="Categoría" v={p.category} />
              <Row k="Subcategoría" v={p.subcategory} />
              <Row k="Modelo" v={p.model} />
              <Row k="Unidad" v={p.unit} />
              {p.kind === 'EQUIPO' && <Row k="Proveedor" v={p.supplier} />}
              {p.lastUpdate && <Row k="Última actualización" v={isoToDMY(p.lastUpdate) || p.lastUpdate} />}
            </tbody>
          </table>
          {p.description && <p style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{p.description}</p>}
          {p.notes && (
            <p className="cot-muted" style={{ whiteSpace: 'pre-line' }}>
              📝 {p.notes}
            </p>
          )}
          <div className="cot-card" style={{ marginTop: 12, background: '#f7fafc' }}>
            <div className="cot-card-title">Desglose de precio</div>
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                <tr>
                  <td>Costo</td>
                  <td style={{ textAlign: 'right' }}>{money(price.baseCost)}</td>
                </tr>
                {price.gananciaProveedor > 0 && (
                  <tr>
                    <td>Ganancia del proveedor</td>
                    <td style={{ textAlign: 'right' }}>{money(price.gananciaProveedor)}</td>
                  </tr>
                )}
                <tr>
                  <td>Precio sin IVA</td>
                  <td style={{ textAlign: 'right' }}>{money(price.priceBeforeIva)}</td>
                </tr>
                <tr>
                  <td>IVA 15%</td>
                  <td style={{ textAlign: 'right' }}>{money(price.iva)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Precio con IVA</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{money(price.subtotalEquipo)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
