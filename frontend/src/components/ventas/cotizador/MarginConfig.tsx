import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CotLine } from '../../../utils/cotizador/types';
import {
  DEFAULT_INSTALL_MARGIN,
  DEFAULT_SUPPLIER_MARGIN,
  SIN_PROVEEDOR,
  getSupplierMargin,
  type ProductComputation,
  type QuoteComputation,
} from '../../../utils/cotizador/pricing';
import { removeLine, setCustomMargin, setInstallFields, setLineQty } from '../../../utils/cotizador/quoteState';
import { money } from '../../../utils/cotizador/format';
import NumInput from './NumInput';

interface Props {
  items: CotLine[];
  comp: QuoteComputation;
  supplierMargins: Record<string, number>;
  readOnly: boolean;
  onItems: (items: CotLine[]) => void;
  onSupplierMargin: (supplier: string, pct: number) => void;
  onPickInstall: () => void;
}

interface Row {
  index: number;
  compIndex?: number;
  c: ProductComputation;
  isKit: boolean;
}

export default function MarginConfig({
  items,
  comp,
  supplierMargins,
  readOnly,
  onItems,
  onSupplierMargin,
  onPickInstall,
}: Props) {
  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    comp.lines.forEach((l, index) => {
      const add = (c: ProductComputation, isKit: boolean, compIndex?: number) => {
        if (!c.item || c.item.isService) return;
        const key = c.item.supplier || SIN_PROVEEDOR;
        g.set(key, [...(g.get(key) ?? []), { index, compIndex, c, isKit }]);
      };
      if (l.kind === 'product') add(l, false);
      else if (l.kind === 'kit') l.comps.forEach((c, compIndex) => add(c, true, compIndex));
    });
    return [...g.entries()].sort(([a], [b]) =>
      a === SIN_PROVEEDOR ? 1 : b === SIN_PROVEEDOR ? -1 : a.localeCompare(b, 'es'),
    );
  }, [comp]);

  const totalRows = groups.reduce((s, [, rows]) => s + rows.length, 0);
  const installs = comp.lines
    .map((l, index) => ({ l, index }))
    .filter((x) => x.l.kind === 'install');
  const withInstallFlag = comp.lines.some(
    (l) =>
      (l.kind === 'product' && l.item?.hasInstalacion) ||
      (l.kind === 'kit' && l.comps.some((c) => c.item?.hasInstalacion)),
  );

  return (
    <div>
      <div className="cot-margin-block">
        <div className="cot-margin-head">
          <span>📦 Ganancia por proveedores</span>
          <span style={{ fontWeight: 500, fontSize: 12 }}>
            {groups.length} proveedor(es) · {totalRows} productos
          </span>
        </div>
        {groups.length === 0 && (
          <div className="cot-muted" style={{ padding: '10px 4px' }}>
            No hay productos de equipo/materiales en la cotización.
          </div>
        )}
        {groups.map(([supplier, rows]) => {
          const sin = supplier === SIN_PROVEEDOR;
          const global = getSupplierMargin(supplierMargins, supplier);
          return (
            <div className="cot-sup-group" key={supplier}>
              <div className="cot-sup-head">
                <span>
                  {supplier} <span className="cot-muted">{rows.length} producto(s)</span>
                </span>
                {sin ? (
                  <span className="cot-muted">Margen individual por ítem ↓</span>
                ) : (
                  <span className="cot-pct">
                    <NumInput
                      value={global}
                      min={0}
                      max={100}
                      step={1}
                      disabled={readOnly}
                      ariaLabel={`Margen de proveedor global para ${supplier}`}
                      onCommit={(n) => onSupplierMargin(supplier, n ?? DEFAULT_SUPPLIER_MARGIN)}
                    />
                    %
                  </span>
                )}
              </div>
              {rows.map(({ index, compIndex, c, isKit }) => (
                <div className="cot-sup-item" key={`${index}-${compIndex ?? ''}`}>
                  <span className="code">{c.item?.code}</span>
                  <span>
                    {c.item?.name}
                    {isKit && <small className="cot-muted"> (kit)</small>}
                    {sin && c.item?.hasGanancia && (
                      <span className="cot-pct" style={{ marginLeft: 10 }}>
                        <NumInput
                          value={c.margin}
                          min={0}
                          max={100}
                          step={1}
                          disabled={readOnly}
                          ariaLabel="Margen de proveedor individual"
                          onCommit={(n) => onItems(setCustomMargin(items, index, n, compIndex))}
                        />
                        %
                      </span>
                    )}
                  </span>
                  <span className="cost">
                    {money(c.price?.baseCost)} → <strong>{money(c.price?.priceBeforeIva)}</strong>{' '}
                    {c.item?.hasGanancia ? (
                      <span style={{ color: '#2b6cb0', fontWeight: 600 }}>+{c.margin}%</span>
                    ) : (
                      <span style={{ color: '#a0aec0' }}>sin ganancia</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="cot-margin-block">
        <div className="cot-margin-head inst">
          <span>🔧 Ganancia por instalación</span>
          {!readOnly && (
            <button type="button" className="btn-secondary" onClick={onPickInstall} style={{ padding: '4px 10px', fontSize: 12 }}>
              <Plus size={13} style={{ verticalAlign: '-2px' }} /> Servicio de instalación
            </button>
          )}
        </div>
        {withInstallFlag && installs.length === 0 && (
          <div className="cot-muted" style={{ padding: '10px 4px' }}>
            Instalación desactivada. Hay productos con instalación disponible: agrega un servicio de instalación.
          </div>
        )}
        {installs.map(({ l, index }) => {
          if (l.kind !== 'install') return null;
          const total = l.baseCost + l.ganancia;
          return (
            <div className="cot-inst-row" key={`i${index}`}>
              <div className="top">
                <span>🔧 {l.line.description}</span>
                {!readOnly && (
                  <button type="button" className="cot-x" onClick={() => onItems(removeLine(items, index))} title="Eliminar servicio" aria-label="Eliminar servicio">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="cot-muted">
                {l.line.category}
                {l.line.subcategory ? ` › ${l.line.subcategory}` : ''}
                {(l.line.category || l.line.subcategory) && ' · '}
                {money(l.baseCost)} × {l.line.qty} + {l.margin}% = {money(total)}
              </div>
              <div className="cot-inst-fields">
                <div>
                  <label>Cant</label>
                  <NumInput
                    value={l.line.qty}
                    min={0}
                    step={1}
                    disabled={readOnly}
                    ariaLabel="Cantidad de servicio"
                    onCommit={(n) => onItems(setLineQty(items, index, Math.max(0, Math.round(n ?? 0))))}
                  />
                </div>
                <div>
                  <label>Costo ($)</label>
                  <NumInput
                    value={Number((l.line.customCost ?? l.line.cost).toFixed(2))}
                    min={0}
                    step={0.01}
                    disabled={readOnly}
                    ariaLabel="Costo del servicio"
                    onCommit={(n) => onItems(setInstallFields(items, index, { customCost: n ?? l.line.cost }))}
                  />
                </div>
                <div>
                  <label>Margen (%)</label>
                  <NumInput
                    value={l.line.customMargin ?? DEFAULT_INSTALL_MARGIN}
                    min={0}
                    max={100}
                    step={1}
                    disabled={readOnly}
                    ariaLabel="Margen de ganancia en porcentaje"
                    onCommit={(n) => onItems(setInstallFields(items, index, { customMargin: n ?? DEFAULT_INSTALL_MARGIN }))}
                  />
                </div>
                <div>
                  <label>Ganancia</label>
                  <strong>{money(l.gananciaTotal)}</strong>
                </div>
                <div>
                  <label>Total</label>
                  <strong>{money(l.pvpTotal)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
