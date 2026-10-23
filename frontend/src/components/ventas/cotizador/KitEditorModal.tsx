import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ErrorBanner from '../../common/ErrorBanner';
import { createCotKit, updateCotKit } from '../../../services/cotizador.service';
import { apiError, money } from '../../../utils/cotizador/format';
import { toPriceItem } from '../../../utils/cotizador/pricing';
import type { CotKit, CotKitComponent, CotProduct } from '../../../utils/cotizador/types';

/** Buscador de un producto del catálogo por código o nombre. */
function ProductPicker({ products, onPick }: { products: CotProduct[]; onPick: (p: CotProduct) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return [];
    return products
      .filter((p) => p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t) || p.model.toLowerCase().includes(t))
      .slice(0, 8);
  }, [products, q]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto para agregar al kit (código, modelo o nombre)..."
        aria-label="Buscar producto para el kit"
      />
      {results.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, background: '#fff', maxHeight: 220, overflowY: 'auto' }}>
          {results.map((p) => (
            <button
              type="button"
              key={p.code}
              className="cot-link"
              style={{ display: 'block', width: '100%', padding: '7px 10px', borderBottom: '1px solid #edf2f7' }}
              onClick={() => {
                onPick(p);
                setQ('');
              }}
            >
              <span className="cot-mono" style={{ fontSize: 11 }}>
                {p.code}
              </span>{' '}
              {p.name.length > 70 ? p.name.slice(0, 67) + '…' : p.name}{' '}
              <span className="cot-muted">{money(toPriceItem(p).cost)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KitEditorModal({
  kit,
  products,
  byCode,
  onClose,
  onSaved,
}: {
  /** null = kit nuevo */
  kit: CotKit | null;
  products: CotProduct[];
  byCode: ReadonlyMap<string, CotProduct>;
  onClose: () => void;
  onSaved: (k: CotKit) => void;
}) {
  const [name, setName] = useState(kit?.name ?? '');
  const [components, setComponents] = useState<CotKitComponent[]>(kit?.components ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const agregar = (p: CotProduct) => {
    setComponents((cs) =>
      cs.some((c) => c.code === p.code)
        ? cs.map((c) => (c.code === p.code ? { ...c, qty: c.qty + 1 } : c))
        : [...cs, { code: p.code, qty: 1, included: true }],
    );
  };

  const guardar = async () => {
    if (!name.trim()) return setError('Escribe el nombre del kit.');
    if (components.length === 0) return setError('Agrega al menos un producto al kit.');
    setBusy(true);
    setError('');
    try {
      onSaved(
        kit
          ? await updateCotKit(kit.id, { name: name.trim(), components })
          : await createCotKit({ name: name.trim(), components }),
      );
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar el kit. Intenta de nuevo.'));
      setBusy(false);
    }
  };

  const total = components
    .filter((c) => c.included)
    .reduce((s, c) => {
      const p = byCode.get(c.code);
      return s + (p ? toPriceItem(p).cost * (c.qty || 1) : 0);
    }, 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-kit-title">
        <div className="modal-header">
          <h3 id="cot-kit-title">{kit ? 'Editar kit' : 'Nuevo kit'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <ErrorBanner mensaje={error} />
          <div className="form-group">
            <label htmlFor="cot-kit-name">Nombre del kit *</label>
            <input id="cot-kit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Kit de 4 cámaras" />
          </div>
          <div className="form-group">
            <label>Productos del kit</label>
            <ProductPicker products={products} onPick={agregar} />
          </div>
          {components.length === 0 ? (
            <p className="cot-muted">Busca y agrega los productos que componen el kit.</p>
          ) : (
            <div className="cot-table-wrap">
              <table className="cot-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="center">Cant</th>
                    <th className="center">Incluido</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {components.map((c, i) => {
                    const p = byCode.get(c.code);
                    return (
                      <tr key={c.code} className={p ? undefined : 'missing'}>
                        <td className="cot-mono" style={{ fontSize: 11 }}>
                          {c.code}
                        </td>
                        <td>{p ? p.name : 'Producto no encontrado'}</td>
                        <td className="center">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="cot-qty"
                            value={c.qty}
                            aria-label={`Cantidad de ${c.code}`}
                            onChange={(e) =>
                              setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))
                            }
                          />
                        </td>
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={c.included}
                            aria-label={`Incluir ${c.code}`}
                            onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)))}
                          />
                        </td>
                        <td>
                          <button type="button" className="cot-x" aria-label="Quitar del kit" onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="cot-muted" style={{ marginBottom: 0 }}>
            <Plus size={12} style={{ verticalAlign: '-1px' }} /> Costo total de los productos incluidos: <strong>{money(total)}</strong>
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="auth-btn" onClick={guardar} disabled={busy}>
            {busy ? 'Guardando...' : kit ? 'Guardar cambios' : 'Crear kit'}
          </button>
        </div>
      </div>
    </div>
  );
}
