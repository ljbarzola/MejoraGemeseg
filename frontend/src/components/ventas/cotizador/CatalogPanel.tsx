import { useEffect, useMemo, useState } from 'react';
import { Search, Package, ClipboardList } from 'lucide-react';
import type { CotKit, CotProduct } from '../../../utils/cotizador/types';
import { calcItemPrice, getSupplierMargin, toPriceItem, serviceCost } from '../../../utils/cotizador/pricing';
import { money } from '../../../utils/cotizador/format';

const KIND_LABEL: Record<CotProduct['kind'], string> = {
  EQUIPO: 'EQUIPOS',
  MATERIAL: 'MATERIALES',
  SERVICIO: 'SERVICIOS',
};

const PAGE_SIZES = [5, 10, 20, 50, 100];

interface Props {
  products: CotProduct[];
  kits: CotKit[];
  byCode: ReadonlyMap<string, CotProduct>;
  supplierMargins: Record<string, number>;
  installMargin: number;
  loading: boolean;
  onAddProduct: (p: CotProduct) => void;
  onAddKit: (k: CotKit) => void;
}

function MarginChips({ p, margin }: { p: CotProduct; margin: number }) {
  if (p.kind === 'SERVICIO') return null;
  return (
    <>
      {p.hasProfit && <span className="cot-chip sup">+{margin}% proveedor</span>}
      {p.hasInstall && <span className="cot-chip inst">Instalación</span>}
      {!p.hasProfit && !p.hasInstall && <span className="cot-chip none">Sin margen</span>}
    </>
  );
}

export default function CatalogPanel({
  products,
  kits,
  byCode,
  supplierMargins,
  installMargin,
  loading,
  onAddProduct,
  onAddKit,
}: Props) {
  const [tab, setTab] = useState<'productos' | 'kits'>('productos');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [kitQ, setKitQ] = useState('');

  const subOptions = useMemo(() => {
    const src = cat ? products.filter((p) => KIND_LABEL[p.kind] === cat) : products;
    return [...new Set(src.map((p) => p.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }, [products, cat]);

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return products.filter((p) => {
      if (cat && KIND_LABEL[p.kind] !== cat) return false;
      if (sub && p.subcategory !== sub) return false;
      if (!term) return true;
      return (
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.model.toLowerCase().includes(term)
      );
    });
  }, [products, q, cat, sub]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filteredKits = useMemo(() => {
    const term = kitQ.toLowerCase().trim();
    if (!term) return kits;
    return kits.filter(
      (k) => k.name.toLowerCase().includes(term) || k.components.some((c) => c.code.toLowerCase().includes(term)),
    );
  }, [kits, kitQ]);

  // Páginas a mostrar: 1, la actual +-1 y la última (con "…" en los saltos)
  const pageButtons = useMemo(() => {
    const set = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
    return [...set].sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <section className="cot-card" aria-label="Catálogo de productos">
      <div className="cot-tabs">
        <button type="button" className={`cot-tab ${tab === 'productos' ? 'active' : ''}`} onClick={() => setTab('productos')}>
          <ClipboardList size={14} style={{ verticalAlign: '-2px' }} /> Productos
        </button>
        <button type="button" className={`cot-tab ${tab === 'kits' ? 'active' : ''}`} onClick={() => setTab('kits')}>
          <Package size={14} style={{ verticalAlign: '-2px' }} /> Kits
        </button>
      </div>

      {tab === 'productos' && (
        <>
          <div className="cot-filters">
            <div className="cot-search" style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#a0aec0' }} />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por código, modelo o descripción..."
                aria-label="Buscar productos por código, modelo o descripción"
                style={{ paddingLeft: 30 }}
              />
            </div>
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setSub('');
                setPage(1);
              }}
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              <option value="EQUIPOS">EQUIPOS</option>
              <option value="MATERIALES">MATERIALES</option>
              <option value="SERVICIOS">SERVICIOS</option>
            </select>
            <select
              value={sub}
              onChange={(e) => {
                setSub(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por subcategoría"
            >
              <option value="">Todas las subcategorías</option>
              {subOptions.map((s) => (
                <option key={s} value={s}>
                  {s.length > 35 ? s.slice(0, 35) + '…' : s}
                </option>
              ))}
            </select>
          </div>

          <div className="cot-catalog-meta">
            <label>
              Mostrar{' '}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Resultados por página"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={9999}>Todos</option>
              </select>{' '}
              resultados
            </label>
            <span id="catalogCount">
              {filtered.length} Productos{filtered.length !== products.length ? ` (de ${products.length})` : ''}
            </span>
          </div>

          <div className="cot-prod-list">
            {loading && <div className="cot-empty">Cargando catálogo...</div>}
            {!loading && filtered.length === 0 && (
              <div className="cot-empty">
                <div className="cot-empty-icon">🔍</div>
                No se encontraron productos
              </div>
            )}
            {pageItems.map((p) => {
              const item = toPriceItem(p);
              const margin = getSupplierMargin(supplierMargins, item.supplier);
              const price = calcItemPrice(item, { supplierMargin: margin, installMargin });
              const annual = p.kind === 'SERVICIO' && !(p.monthlyCost > 0) && p.annualCost > 0;
              return (
                <div className="cot-prod" key={p.code}>
                  <div className="cot-prod-info">
                    <div className="cot-prod-code">
                      {p.code}
                      {p.model && <span className="cot-prod-model">{p.model}</span>}
                    </div>
                    <div className="cot-prod-name">{p.name}</div>
                    <div className="cot-chips">
                      {p.subcategory && <span className="cot-chip">{p.subcategory}</span>}
                      {p.unit && <span className="cot-chip">{p.unit}</span>}
                      {p.defaultQty > 0 && p.defaultQty !== 1 && <span className="cot-chip">x{p.defaultQty}</span>}
                      {annual && <span className="cot-chip annual">anual</span>}
                      <MarginChips p={p} margin={margin} />
                      {item.supplier && <span className="cot-muted">· {item.supplier}</span>}
                    </div>
                  </div>
                  <div className="cot-prod-side">
                    <div className="cot-prod-price">
                      <strong>{money(price.subtotalEquipo)}</strong>
                      <span>
                        {annual
                          ? `${money(p.annualCost)}/año → ${money(serviceCost(p))}/mes`
                          : `costo ${money(item.cost)}`}
                      </span>
                    </div>
                    <button type="button" className="cot-add-btn" onClick={() => onAddProduct(p)}>
                      + Agregar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="cot-pagination" aria-label="Paginación del catálogo">
              <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                ‹
              </button>
              {pageButtons.map((n, i) => (
                <span key={n} style={{ display: 'contents' }}>
                  {i > 0 && n - pageButtons[i - 1] > 1 && <span style={{ alignSelf: 'center' }}>…</span>}
                  <button type="button" className={n === page ? 'active' : ''} onClick={() => setPage(n)}>
                    {n}
                  </button>
                </span>
              ))}
              <button type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
                ›
              </button>
            </div>
          )}
          <div className="cot-muted" style={{ marginTop: 8 }}>
            Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de{' '}
            {filtered.length}
          </div>
        </>
      )}

      {tab === 'kits' && (
        <>
          <div className="cot-filters">
            <div className="cot-search" style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#a0aec0' }} />
              <input
                type="text"
                value={kitQ}
                onChange={(e) => setKitQ(e.target.value)}
                placeholder="Buscar kit por nombre o código..."
                aria-label="Buscar kit por nombre o código"
                style={{ paddingLeft: 30 }}
              />
            </div>
          </div>
          <div className="cot-prod-list">
            {filteredKits.length === 0 && (
              <div className="cot-empty">
                <div className="cot-empty-icon">📦</div>
                {kits.length === 0 ? 'Aún no hay kits. Créalos en Catálogo → Kits.' : 'No se encontraron kits'}
              </div>
            )}
            {filteredKits.map((k) => {
              const comps = k.components.filter((c) => c.included && byCode.has(c.code));
              const total = comps.reduce((s, c) => {
                const p = byCode.get(c.code)!;
                return s + toPriceItem(p).cost * (c.qty || 1);
              }, 0);
              return (
                <div className="cot-prod" key={k.id}>
                  <div className="cot-prod-info">
                    <div className="cot-prod-name">📦 {k.name}</div>
                    <div className="cot-chips">
                      <span className="cot-chip">{comps.length} componente(s)</span>
                      {comps.slice(0, 4).map((c) => (
                        <span key={c.code} className="cot-chip none">
                          {c.code}
                        </span>
                      ))}
                      {comps.length > 4 && <span className="cot-muted">+{comps.length - 4}</span>}
                    </div>
                  </div>
                  <div className="cot-prod-side">
                    <div className="cot-prod-price">
                      <strong>{money(total)}</strong>
                      <span>costo</span>
                    </div>
                    <button type="button" className="cot-add-btn" onClick={() => onAddKit(k)} disabled={comps.length === 0}>
                      + Agregar kit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
