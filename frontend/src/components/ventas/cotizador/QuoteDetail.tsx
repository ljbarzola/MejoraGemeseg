import { Fragment } from 'react';
import type { QuoteComputation, ProductComputation } from '../../../utils/cotizador/pricing';
import type { CotLine } from '../../../utils/cotizador/types';
import {
  removeKitComp,
  removeLine,
  setKitCompQty,
  setLineQty,
  toggleInstallActive,
} from '../../../utils/cotizador/quoteState';
import { money } from '../../../utils/cotizador/format';
import NumInput from './NumInput';

interface Props {
  items: CotLine[];
  comp: QuoteComputation;
  readOnly: boolean;
  onItems: (items: CotLine[]) => void;
  onOpenProduct: (code: string) => void;
}

function Chips({ c }: { c: ProductComputation }) {
  const it = c.item;
  if (!it) return null;
  return (
    <div className="cot-chips" style={{ marginTop: 3 }}>
      {!it.isService && it.hasGanancia && <span className="cot-chip sup">+{c.margin}% proveedor</span>}
      {!it.isService && it.hasInstalacion && <span className="cot-chip inst">Instalación</span>}
      {!it.isService && !it.hasGanancia && !it.hasInstalacion && <span className="cot-chip none">Sin margen</span>}
      {c.change && (
        <span className="cot-warn" title={`Se cotizó a ${money(c.change.frozenCost)}; hoy cuesta ${money(c.change.currentCost)}`}>
          precio de cuando se cotizó
        </span>
      )}
      {c.legacy && (
        <span className="cot-warn" title="Esta línea de una cotización antigua se identificó por su posición en la lista. Verifica que sea el producto correcto.">
          verificar producto
        </span>
      )}
    </div>
  );
}

function ProductRow({
  c,
  num,
  readOnly,
  onQty,
  onToggleInstall,
  onRemove,
  onOpen,
  isKitComp,
}: {
  c: ProductComputation;
  num: number;
  readOnly: boolean;
  onQty: (qty: number) => void;
  onToggleInstall: () => void;
  onRemove: () => void;
  onOpen: () => void;
  isKitComp?: boolean;
}) {
  if (c.missing || !c.item || !c.price) {
    return (
      <tr className="missing">
        <td className="num">{num}</td>
        <td colSpan={8}>
          <strong>Producto no encontrado</strong> · {c.line.code || 'sin código'}
          <br />
          <small style={{ color: '#c53030' }}>
            Ya no existe en el catálogo. No suma al total: quítalo o reemplázalo por otro.
          </small>
        </td>
        <td>
          {!readOnly && (
            <button type="button" className="cot-x" onClick={onRemove} aria-label="Quitar">
              ✕
            </button>
          )}
        </td>
      </tr>
    );
  }
  const it = c.item;
  return (
    <tr className={isKitComp ? 'kit-comp' : undefined}>
      <td className="num">{num}</td>
      <td>
        <button type="button" className="cot-link" onClick={onOpen} title="Ver detalle">
          <strong style={{ fontWeight: 600 }}>{it.name}</strong>
        </button>
        <Chips c={c} />
        <small>{it.code}</small>
        {it.supplier && <small className="cot-screen-only"> · {it.supplier}</small>}
      </td>
      <td className="center" style={{ fontSize: 11, fontWeight: 600 }}>
        {it.unit || (it.isService ? 'servicio' : '—')}
      </td>
      <td className="right">{money(c.price.baseCost)}</td>
      <td className="center">
        <NumInput
          value={c.line.qty ?? 1}
          min={0}
          disabled={readOnly}
          ariaLabel={isKitComp ? 'Cantidad de componente del kit' : 'Cantidad de producto'}
          className="cot-qty"
          onCommit={(n) => onQty(n ?? 0)}
        />
      </td>
      <td className="right">
        <strong>{money(c.costTotal)}</strong>
      </td>
      <td className="right">{c.gananciaTotal > 0 ? money(c.gananciaTotal) : <span style={{ color: '#a0aec0' }}>—</span>}</td>
      <td className="right">{money(c.pvpTotal)}</td>
      <td className="center">
        {it.hasInstalacion ? (
          <button
            type="button"
            className={`cot-inst-box ${c.line.installActive ? 'on' : ''}`}
            onClick={onToggleInstall}
            disabled={readOnly}
            title={c.line.installActive ? 'Instalación requerida (activa)' : 'Sin instalación'}
            aria-label={c.line.installActive ? 'Quitar instalación' : 'Requiere instalación'}
          />
        ) : (
          <span style={{ color: '#a0aec0' }}>—</span>
        )}
      </td>
      <td>
        {!readOnly && (
          <button type="button" className="cot-x" onClick={onRemove} title="Eliminar" aria-label="Eliminar">
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

export default function QuoteDetail({ items, comp, readOnly, onItems, onOpenProduct }: Props) {
  // Primero los kits y después los productos sueltos. Los servicios de instalación van solo en "Ganancia por instalación".
  const kits = comp.lines.map((l, index) => ({ l, index })).filter((x) => x.l.kind === 'kit');
  const prods = comp.lines.map((l, index) => ({ l, index })).filter((x) => x.l.kind === 'product');
  let n = 0;

  if (kits.length === 0 && prods.length === 0) {
    return (
      <div className="cot-empty">
        <div className="cot-empty-icon">🛒</div>
        Aún no hay productos en la cotización.
        <div className="cot-muted" style={{ marginTop: 4 }}>
          Busca y agrega productos del catálogo (panel izquierdo)
        </div>
      </div>
    );
  }

  return (
    <div className="cot-table-wrap">
      <table className="cot-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Nombre</th>
            <th className="center">Und</th>
            <th className="right">Costo unit.</th>
            <th className="center">Cant</th>
            <th className="right">Costo total</th>
            <th className="right">Ganancia</th>
            <th className="right">PVP</th>
            <th className="center">Inst</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kits.map(({ l, index }) => {
            if (l.kind !== 'kit') return null;
            return (
              <Fragment key={`k${index}`}>
                <tr className="kit-row">
                  <td className="num">📦</td>
                  <td colSpan={8}>
                    {l.line.kitName}{' '}
                    <span className="cot-muted" style={{ fontWeight: 400 }}>
                      {l.comps.length} componente(s) ·
                    </span>{' '}
                    <span className="cot-muted" style={{ fontWeight: 400 }}>
                      cantidad del kit:{' '}
                    </span>
                    <NumInput
                      value={l.line.qty}
                      min={0}
                      disabled={readOnly}
                      ariaLabel="Cantidad del kit"
                      className="cot-qty"
                      onCommit={(v) => onItems(setLineQty(items, index, v ?? 0))}
                    />
                  </td>
                  <td>
                    {!readOnly && (
                      <button type="button" className="cot-x" onClick={() => onItems(removeLine(items, index))} title="Eliminar kit" aria-label="Eliminar kit">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
                {l.comps.map((c, compIndex) => (
                  <ProductRow
                    key={`k${index}c${compIndex}`}
                    c={c}
                    num={++n}
                    readOnly={readOnly}
                    isKitComp
                    onQty={(v) => onItems(setKitCompQty(items, index, compIndex, v))}
                    onToggleInstall={() => onItems(toggleInstallActive(items, index, compIndex))}
                    onRemove={() => onItems(removeKitComp(items, index, compIndex))}
                    onOpen={() => onOpenProduct(c.line.code)}
                  />
                ))}
              </Fragment>
            );
          })}
          {kits.length > 0 && prods.length > 0 && (
            <tr className="sep">
              <td colSpan={10}>
                <div style={{ borderTop: '2px dashed #cbd5e0' }} />
              </td>
            </tr>
          )}
          {prods.map(({ l, index }) =>
            l.kind === 'product' ? (
              <ProductRow
                key={`p${index}`}
                c={l}
                num={++n}
                readOnly={readOnly}
                onQty={(v) => onItems(setLineQty(items, index, v))}
                onToggleInstall={() => onItems(toggleInstallActive(items, index))}
                onRemove={() => onItems(removeLine(items, index))}
                onOpen={() => onOpenProduct(l.line.code)}
              />
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}
