import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import RowActionsMenu from '../../common/RowActionsMenu';
import SoloAdminDialog from '../../common/SoloAdminDialog';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { deleteCotInstall, deleteCotKit, deleteCotProduct } from '../../../services/cotizador.service';
import { apiError, money } from '../../../utils/cotizador/format';
import { compareCodes, serviceCost } from '../../../utils/cotizador/pricing';
import type { CotInstall, CotKit, CotProduct } from '../../../utils/cotizador/types';
import { InstallFormModal, ProductFormModal } from './CatalogForms';
import KitEditorModal from './KitEditorModal';

type Tab = 'productos' | 'instalaciones' | 'kits';

const KIND_LABEL: Record<CotProduct['kind'], string> = { EQUIPO: 'Equipos', MATERIAL: 'Materiales', SERVICIO: 'Servicios' };

const COLS_PROD = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'subcategoria', label: 'Subcategoría' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'costo', label: 'Costo' },
  { key: 'margenes', label: 'Márgenes' },
  { key: 'proveedor', label: 'Proveedor' },
];
const DEF_PROD = ['tipo', 'nombre', 'subcategoria', 'costo', 'margenes', 'proveedor'];
const ANCHO_PROD: Record<string, number> = {
  codigo: 100, tipo: 100, nombre: 320, modelo: 140, subcategoria: 160, unidad: 80, costo: 100, margenes: 150, proveedor: 130, acciones: 64,
};

interface Props {
  products: CotProduct[];
  installs: CotInstall[];
  kits: CotKit[];
  byCode: ReadonlyMap<string, CotProduct>;
  canWrite: boolean;
  onClose: () => void;
  /** Después de crear/editar/eliminar algo: vuelve a cargar el catálogo. */
  onChanged: (aviso?: string) => void;
}

export default function CatalogManager({ products, installs, kits, byCode, canWrite, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('productos');
  const [error, setError] = useState('');
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);

  // Formularios
  const [productForm, setProductForm] = useState<{ product: CotProduct | null } | null>(null);
  const [installForm, setInstallForm] = useState<{ install: CotInstall | null } | null>(null);
  const [kitForm, setKitForm] = useState<{ kit: CotKit | null } | null>(null);
  const [aEliminar, setAEliminar] = useState<{ tipo: Tab; id: number; texto: string } | null>(null);

  const pedir = (accion: string, fn: () => void) => (canWrite ? fn() : setSoloAdmin(accion));

  const subcats = useMemo(
    () => [...new Set(products.map((p) => p.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );
  const suppliers = useMemo(
    () => [...new Set(products.map((p) => p.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    const { tipo, id } = aEliminar;
    setAEliminar(null);
    setError('');
    try {
      if (tipo === 'productos') await deleteCotProduct(id);
      else if (tipo === 'instalaciones') await deleteCotInstall(id);
      else await deleteCotKit(id);
      onChanged(tipo === 'kits' ? 'Kit eliminado' : 'Eliminado del catálogo');
    } catch (e) {
      setError(apiError(e, 'No se pudo eliminar. Intenta de nuevo.'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 1250, width: '97vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-cm-title"
      >
        <div className="modal-header">
          <h3 id="cot-cm-title">📦 Catálogo del Cotizador</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="cot-tabs">
            <button type="button" className={`cot-tab ${tab === 'productos' ? 'active' : ''}`} onClick={() => setTab('productos')}>
              Productos ({products.length})
            </button>
            <button type="button" className={`cot-tab ${tab === 'instalaciones' ? 'active' : ''}`} onClick={() => setTab('instalaciones')}>
              Instalaciones ({installs.length})
            </button>
            <button type="button" className={`cot-tab ${tab === 'kits' ? 'active' : ''}`} onClick={() => setTab('kits')}>
              Kits ({kits.length})
            </button>
          </div>

          {tab === 'productos' && (
            <ProductsTab
              products={products}
              onNew={() => pedir('agregue productos al catálogo', () => setProductForm({ product: null }))}
              onEdit={(p) => pedir('edite productos del catálogo', () => setProductForm({ product: p }))}
              onDelete={(p) =>
                pedir('elimine productos del catálogo', () =>
                  setAEliminar({ tipo: 'productos', id: p.id, texto: `${p.code} — ${p.name.slice(0, 60)}` }),
                )
              }
            />
          )}
          {tab === 'instalaciones' && (
            <InstallsTab
              installs={installs}
              onNew={() => pedir('agregue servicios de instalación', () => setInstallForm({ install: null }))}
              onEdit={(i) => pedir('edite servicios de instalación', () => setInstallForm({ install: i }))}
              onDelete={(i) =>
                pedir('elimine servicios de instalación', () =>
                  setAEliminar({ tipo: 'instalaciones', id: i.id, texto: `${i.code} — ${i.name.slice(0, 60)}` }),
                )
              }
            />
          )}
          {tab === 'kits' && (
            <KitsTab
              kits={kits}
              byCode={byCode}
              onNew={() => pedir('cree kits', () => setKitForm({ kit: null }))}
              onEdit={(k) => pedir('edite kits', () => setKitForm({ kit: k }))}
              onDelete={(k) => pedir('elimine kits', () => setAEliminar({ tipo: 'kits', id: k.id, texto: k.name }))}
            />
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {productForm && (
        <ProductFormModal
          product={productForm.product}
          subcategories={subcats}
          suppliers={suppliers}
          onClose={() => setProductForm(null)}
          onSaved={(p, creado) => {
            setProductForm(null);
            onChanged(creado ? `Producto creado: ${p.code}` : `Producto actualizado: ${p.code}`);
          }}
        />
      )}
      {installForm && (
        <InstallFormModal
          install={installForm.install}
          categories={[...new Set(installs.map((i) => i.category).filter(Boolean))]}
          subcategories={[...new Set(installs.map((i) => i.subcategory).filter(Boolean))]}
          onClose={() => setInstallForm(null)}
          onSaved={(i) => {
            setInstallForm(null);
            onChanged(`Servicio guardado: ${i.code}`);
          }}
        />
      )}
      {kitForm && (
        <KitEditorModal
          kit={kitForm.kit}
          products={products}
          byCode={byCode}
          onClose={() => setKitForm(null)}
          onSaved={() => {
            setKitForm(null);
            onChanged('Kit guardado');
          }}
        />
      )}
      {aEliminar && (
        <ConfirmDialog
          title={aEliminar.tipo === 'kits' ? 'Eliminar kit' : 'Eliminar del catálogo'}
          message={
            aEliminar.tipo === 'kits'
              ? `¿Eliminar el kit "${aEliminar.texto}"?`
              : `¿Eliminar "${aEliminar.texto}"? Dejará de aparecer en el catálogo, pero las cotizaciones que ya lo usaron no cambian en nada.`
          }
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

function ProductsTab({
  products,
  onNew,
  onEdit,
  onDelete,
}: {
  products: CotProduct[];
  onNew: () => void;
  onEdit: (p: CotProduct) => void;
  onDelete: (p: CotProduct) => void;
}) {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [sub, setSub] = useState('');
  const prefs = useColumnPreferences('cotizador-catalogo', DEF_PROD);
  const visibles = prefs.visible.filter((k) => COLS_PROD.some((c) => c.key === k));
  const tablaRef = useResizableColumns('cotizador-catalogo', ['codigo', ...visibles, 'acciones']);

  const subs = useMemo(
    () =>
      [...new Set(products.filter((p) => !tipo || p.kind === tipo).map((p) => p.subcategory).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [products, tipo],
  );

  const filtrados = useMemo(() => {
    const t = q.toLowerCase().trim();
    return products.filter(
      (p) =>
        (!tipo || p.kind === tipo) &&
        (!sub || p.subcategory === sub) &&
        (!t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t) || p.model.toLowerCase().includes(t)),
    );
  }, [products, q, tipo, sub]);

  const campos = useMemo(
    () => ({
      codigo: (p: CotProduct) => p.code,
      tipo: (p: CotProduct) => p.kind,
      nombre: (p: CotProduct) => p.name,
      modelo: (p: CotProduct) => p.model,
      subcategoria: (p: CotProduct) => p.subcategory,
      unidad: (p: CotProduct) => p.unit,
      costo: (p: CotProduct) => (p.kind === 'SERVICIO' ? serviceCost(p) : p.unitCost),
      margenes: (p: CotProduct) => (p.hasProfit ? 1 : 0) + (p.hasInstall ? 2 : 0),
      proveedor: (p: CotProduct) => p.supplier,
    }),
    [],
  );
  const ordenados = useMemo(() => [...filtrados].sort((a, b) => compareCodes(a.code, b.code)), [filtrados]);
  const { filas, thProps, SortIcon } = useSortableTable(ordenados, campos, 'codigo');

  const th = (key: string, label: string) => (
    <th {...thProps(key)} style={{ width: ANCHO_PROD[key] }}>
      {label} <SortIcon campo={key} />
    </th>
  );

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, modelo o nombre..."
            aria-label="Buscar en el catálogo"
            style={{ flex: '1 1 220px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
          />
          <select
            className="filter-select"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setSub('');
            }}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos los tipos</option>
            {(Object.keys(KIND_LABEL) as CotProduct['kind'][]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select className="filter-select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Filtrar por subcategoría">
            <option value="">Todas las subcategorías</option>
            {subs.map((s) => (
              <option key={s} value={s}>
                {s.length > 35 ? s.slice(0, 35) + '…' : s}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu columns={COLS_PROD} visible={visibles} fixedLabel="Código" onApply={(k) => prefs.set(k)} />
          <ClearFiltersButton
            disabled={!q && !tipo && !sub}
            onClear={() => {
              setQ('');
              setTipo('');
              setSub('');
            }}
          />
          <button type="button" className="auth-btn" onClick={onNew}>
            <Plus size={15} /> Nuevo producto
          </button>
        </div>
      </div>
      <p className="cot-muted">{filas.length} productos</p>
      {filas.length === 0 ? (
        <div className="cot-empty">
          <div className="cot-empty-icon">📦</div>
          {products.length === 0 ? 'Aún no hay productos en el catálogo.' : 'No hay productos con esos filtros.'}
        </div>
      ) : (
        <div className="tasks-table-wrapper" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="tasks-table resizable-table" ref={tablaRef}>
            <thead>
              <tr>
                {th('codigo', 'Código')}
                {visibles.map((k) => th(k, COLS_PROD.find((c) => c.key === k)!.label))}
                <th className="col-acciones" title="Acciones">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id}>
                  <td className="cot-mono" style={{ fontSize: 12 }}>
                    {p.code}
                  </td>
                  {visibles.map((k) => {
                    switch (k) {
                      case 'tipo':
                        return <td key={k}>{KIND_LABEL[p.kind]}</td>;
                      case 'nombre':
                        return (
                          <td key={k} className="truncate" title={p.name}>
                            {p.name}
                          </td>
                        );
                      case 'modelo':
                        return <td key={k} className="truncate">{p.model}</td>;
                      case 'subcategoria':
                        return <td key={k} className="truncate">{p.subcategory}</td>;
                      case 'unidad':
                        return <td key={k}>{p.unit}</td>;
                      case 'costo':
                        return (
                          <td key={k} style={{ textAlign: 'right' }}>
                            {money(p.kind === 'SERVICIO' ? serviceCost(p) : p.unitCost)}
                          </td>
                        );
                      case 'margenes':
                        return (
                          <td key={k}>
                            {p.kind === 'SERVICIO' ? (
                              '—'
                            ) : (
                              <>
                                {p.hasProfit && <span className="cot-chip sup">Ganancia</span>}{' '}
                                {p.hasInstall && <span className="cot-chip inst">Instalación</span>}
                                {!p.hasProfit && !p.hasInstall && <span className="cot-chip none">Sin margen</span>}
                              </>
                            )}
                          </td>
                        );
                      default:
                        return <td key={k} className="truncate">{p.supplier}</td>;
                    }
                  })}
                  <td className="col-acciones">
                    <RowActionsMenu
                      actions={[
                        { label: 'Editar', icon: <Pencil size={14} />, onClick: () => onEdit(p) },
                        { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(p) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Instalaciones
// ---------------------------------------------------------------------------

const COLS_INST = [
  { key: 'nombre', label: 'Servicio' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'subcategoria', label: 'Subcategoría' },
  { key: 'costo', label: 'Costo' },
];
const ANCHO_INST: Record<string, number> = { codigo: 100, nombre: 320, categoria: 160, subcategoria: 180, costo: 100, acciones: 64 };

function InstallsTab({
  installs,
  onNew,
  onEdit,
  onDelete,
}: {
  installs: CotInstall[];
  onNew: () => void;
  onEdit: (i: CotInstall) => void;
  onDelete: (i: CotInstall) => void;
}) {
  const [q, setQ] = useState('');
  const prefs = useColumnPreferences('cotizador-instalaciones', COLS_INST.map((c) => c.key));
  const visibles = prefs.visible.filter((k) => COLS_INST.some((c) => c.key === k));
  const tablaRef = useResizableColumns('cotizador-instalaciones', ['codigo', ...visibles, 'acciones']);

  const filtradas = useMemo(() => {
    const t = q.toLowerCase().trim();
    return installs.filter((i) => !t || i.code.toLowerCase().includes(t) || i.name.toLowerCase().includes(t));
  }, [installs, q]);

  const campos = useMemo(
    () => ({
      codigo: (i: CotInstall) => i.code,
      nombre: (i: CotInstall) => i.name,
      categoria: (i: CotInstall) => i.category,
      subcategoria: (i: CotInstall) => i.subcategory,
      costo: (i: CotInstall) => i.unitCost,
    }),
    [],
  );
  const { filas, thProps, SortIcon } = useSortableTable(filtradas, campos, 'codigo');
  const th = (key: string, label: string) => (
    <th {...thProps(key)} style={{ width: ANCHO_INST[key] }}>
      {label} <SortIcon campo={key} />
    </th>
  );

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar servicio..."
            aria-label="Buscar servicio de instalación"
            style={{ flex: '1 1 220px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu columns={COLS_INST} visible={visibles} fixedLabel="Código" onApply={(k) => prefs.set(k)} />
          <ClearFiltersButton disabled={!q} onClear={() => setQ('')} />
          <button type="button" className="auth-btn" onClick={onNew}>
            <Plus size={15} /> Nuevo servicio
          </button>
        </div>
      </div>
      {filas.length === 0 ? (
        <div className="cot-empty">
          <div className="cot-empty-icon">🔧</div>
          {installs.length === 0 ? 'Aún no hay servicios de instalación.' : 'No hay servicios con ese filtro.'}
        </div>
      ) : (
        <div className="tasks-table-wrapper" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="tasks-table resizable-table" ref={tablaRef}>
            <thead>
              <tr>
                {th('codigo', 'Código')}
                {visibles.map((k) => th(k, COLS_INST.find((c) => c.key === k)!.label))}
                <th className="col-acciones" title="Acciones">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((i) => (
                <tr key={i.id}>
                  <td className="cot-mono" style={{ fontSize: 12 }}>
                    {i.code}
                  </td>
                  {visibles.map((k) => {
                    if (k === 'nombre') return <td key={k} className="truncate" title={i.name}>{i.name}</td>;
                    if (k === 'categoria') return <td key={k} className="truncate">{i.category}</td>;
                    if (k === 'subcategoria') return <td key={k} className="truncate">{i.subcategory}</td>;
                    return <td key={k} style={{ textAlign: 'right' }}>{money(i.unitCost)}</td>;
                  })}
                  <td className="col-acciones">
                    <RowActionsMenu
                      actions={[
                        { label: 'Editar', icon: <Pencil size={14} />, onClick: () => onEdit(i) },
                        { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(i) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

function KitsTab({
  kits,
  byCode,
  onNew,
  onEdit,
  onDelete,
}: {
  kits: CotKit[];
  byCode: ReadonlyMap<string, CotProduct>;
  onNew: () => void;
  onEdit: (k: CotKit) => void;
  onDelete: (k: CotKit) => void;
}) {
  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar-fields" />
        <div className="filter-bar-actions">
          <button type="button" className="auth-btn" onClick={onNew}>
            <Plus size={15} /> Nuevo kit
          </button>
        </div>
      </div>
      {kits.length === 0 ? (
        <div className="cot-empty">
          <div className="cot-empty-icon">📦</div>
          Aún no hay kits. Crea uno para agregar varios productos juntos a una cotización.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {kits.map((k) => {
            const comps = k.components.filter((c) => c.included);
            const faltan = comps.filter((c) => !byCode.has(c.code)).length;
            return (
              <div className="cot-prod" key={k.id}>
                <div className="cot-prod-info">
                  <div className="cot-prod-name">📦 {k.name}</div>
                  <div className="cot-chips">
                    <span className="cot-chip">{comps.length} componente(s)</span>
                    {faltan > 0 && <span className="cot-warn">{faltan} ya no existe(n) en el catálogo</span>}
                    {comps.slice(0, 6).map((c) => (
                      <span key={c.code} className="cot-chip none">
                        {c.code} ×{c.qty}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="cot-prod-side" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary icon-btn" title="Editar kit" aria-label="Editar kit" onClick={() => onEdit(k)}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="btn-secondary icon-btn" title="Eliminar kit" aria-label="Eliminar kit" onClick={() => onDelete(k)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
