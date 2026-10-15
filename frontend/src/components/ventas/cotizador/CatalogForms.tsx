import { useEffect, useMemo, useState } from 'react';
import DateInput from '../../common/DateInput';
import ErrorBanner from '../../common/ErrorBanner';
import {
  createCotInstall,
  createCotProduct,
  getCotNextCode,
  updateCotInstall,
  updateCotProduct,
  type CotCodeType,
} from '../../../services/cotizador.service';
import { apiError } from '../../../utils/cotizador/format';
import type { CotInstall, CotKind, CotProduct } from '../../../utils/cotizador/types';

const KIND_LABEL: Record<CotKind, string> = { EQUIPO: 'EQUIPOS', MATERIAL: 'MATERIALES', SERVICIO: 'SERVICIOS' };
const KIND_NAME: Record<CotKind, string> = { EQUIPO: 'Equipo', MATERIAL: 'Material', SERVICIO: 'Servicio' };

const num = (s: string): number => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// ---------------------------------------------------------------------------
// Producto: crear / editar
// ---------------------------------------------------------------------------

export function ProductFormModal({
  product,
  subcategories,
  suppliers,
  onClose,
  onSaved,
}: {
  /** null = producto nuevo */
  product: CotProduct | null;
  subcategories: string[];
  suppliers: string[];
  onClose: () => void;
  onSaved: (p: CotProduct, creado: boolean) => void;
}) {
  const edit = !!product;
  const [kind, setKind] = useState<CotKind>(product?.kind ?? 'EQUIPO');
  const [name, setName] = useState(product?.name ?? '');
  const [subcategory, setSubcategory] = useState(product?.subcategory ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [defaultQty, setDefaultQty] = useState(String(product?.defaultQty ?? 1));
  const [unitCost, setUnitCost] = useState(String(product?.unitCost ?? 0));
  const [monthlyCost, setMonthlyCost] = useState(String(product?.monthlyCost ?? 0));
  const [annualCost, setAnnualCost] = useState(String(product?.annualCost ?? 0));
  const [description, setDescription] = useState(product?.description ?? '');
  const [supplier, setSupplier] = useState(product?.supplier ?? '');
  const [hasProfit, setHasProfit] = useState(product?.hasProfit ?? true);
  const [hasInstall, setHasInstall] = useState(product?.hasInstall ?? true);
  const [lastUpdate, setLastUpdate] = useState(product?.lastUpdate ?? '');
  const [notes, setNotes] = useState(product?.notes ?? '');
  const [nextCode, setNextCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // El código lo asigna el servidor al guardar; aquí solo se muestra cuál sería (sin gastarlo).
  useEffect(() => {
    if (edit) return;
    getCotNextCode(kind as CotCodeType)
      .then((r) => setNextCode(r.code))
      .catch(() => setNextCode(''));
  }, [kind, edit]);

  const guardar = async () => {
    if (!name.trim()) return setError(kind === 'SERVICIO' ? 'Escribe el nombre del servicio.' : 'Escribe el nombre o descripción del producto.');
    setBusy(true);
    setError('');
    const base = {
      name: name.trim(),
      subcategory: subcategory.trim(),
      unit: unit.trim() || (kind === 'SERVICIO' ? 'servicio' : 'u'),
      defaultQty: num(defaultQty) || 1,
      notes,
      ...(kind === 'SERVICIO'
        ? { description, monthlyCost: num(monthlyCost), annualCost: num(annualCost) }
        : {
            unitCost: num(unitCost),
            hasProfit,
            hasInstall,
            ...(kind === 'EQUIPO' ? { model: model.trim(), supplier: supplier.trim(), lastUpdate } : {}),
          }),
    };
    try {
      const saved = product
        ? await updateCotProduct(product.id, base)
        : await createCotProduct({ ...base, kind, category: KIND_LABEL[kind] });
      onSaved(saved, !product);
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar el producto. Revisa los datos e intenta de nuevo.'));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-pf-title">
        <div className="modal-header">
          <h3 id="cot-pf-title">{edit ? `Editar ${product!.code}` : 'Nuevo producto'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <ErrorBanner mensaje={error} />
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cot-pf-kind">Tipo *</label>
              <select id="cot-pf-kind" value={kind} onChange={(e) => setKind(e.target.value as CotKind)} disabled={edit}>
                {(Object.keys(KIND_NAME) as CotKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_NAME[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cot-pf-code">Código</label>
              <input
                id="cot-pf-code"
                value={edit ? product!.code : nextCode ? `${nextCode} (automático)` : '(automático)'}
                readOnly
                title="El sistema asigna el siguiente código al guardar y no se puede cambiar"
                style={{ background: '#f1f5f9', color: '#4a5568', cursor: 'not-allowed' }}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="cot-pf-name">{kind === 'SERVICIO' ? 'Nombre del servicio *' : 'Nombre del producto / descripción *'}</label>
            <textarea id="cot-pf-name" rows={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Descripción clara y completa del ítem..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cot-pf-sub">Subcategoría</label>
              <input id="cot-pf-sub" list="cot-subs" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Elige o escribe una nueva" />
              <datalist id="cot-subs">
                {subcategories.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            {kind === 'EQUIPO' && (
              <div className="form-group">
                <label htmlFor="cot-pf-model">Modelo</label>
                <input id="cot-pf-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej: DS-2CD2043G2-I" />
              </div>
            )}
          </div>

          {kind === 'SERVICIO' ? (
            <>
              <div className="form-group">
                <label htmlFor="cot-pf-desc">Descripción</label>
                <textarea id="cot-pf-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="cot-pf-mc">Costo mensual ($)</label>
                  <input id="cot-pf-mc" type="number" min={0} step="0.01" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="cot-pf-ac">Costo anual ($)</label>
                  <input id="cot-pf-ac" type="number" min={0} step="0.01" value={annualCost} onChange={(e) => setAnnualCost(e.target.value)} />
                </div>
              </div>
              <p className="cot-muted">Si solo llenas el costo anual, el servicio entra a la cotización por 12 meses.</p>
            </>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="cot-pf-uc">Costo unitario ($)</label>
                  <input id="cot-pf-uc" type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="cot-pf-unit">Unidad</label>
                  <input id="cot-pf-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="u, m, caja..." />
                </div>
                <div className="form-group">
                  <label htmlFor="cot-pf-dq">Cantidad por defecto</label>
                  <input id="cot-pf-dq" type="number" min={0} step="1" value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} />
                </div>
              </div>
              {kind === 'EQUIPO' && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cot-pf-sup">Proveedor</label>
                    <input id="cot-pf-sup" list="cot-sups" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Elige o escribe uno nuevo" />
                    <datalist id="cot-sups">
                      {suppliers.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Última actualización de precio</label>
                    <DateInput value={lastUpdate} onChange={setLastUpdate} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '6px 0 10px' }}>
                <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={hasProfit} onChange={(e) => setHasProfit(e.target.checked)} />
                  Lleva ganancia del proveedor
                </label>
                <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={hasInstall} onChange={(e) => setHasInstall(e.target.checked)} />
                  Lleva ganancia de instalación
                </label>
              </div>
            </>
          )}
          <div className="form-group">
            <label htmlFor="cot-pf-notes">Observaciones</label>
            <textarea id="cot-pf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="auth-btn" onClick={guardar} disabled={busy}>
            {busy ? 'Guardando...' : edit ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Servicio de instalación: crear / editar
// ---------------------------------------------------------------------------

export function InstallFormModal({
  install,
  categories,
  subcategories,
  onClose,
  onSaved,
}: {
  install: CotInstall | null;
  categories: string[];
  subcategories: string[];
  onClose: () => void;
  onSaved: (i: CotInstall) => void;
}) {
  const edit = !!install;
  const [name, setName] = useState(install?.name ?? '');
  const [category, setCategory] = useState(install?.category ?? '');
  const [subcategory, setSubcategory] = useState(install?.subcategory ?? '');
  const [unitCost, setUnitCost] = useState(String(install?.unitCost ?? 0));
  const [notes, setNotes] = useState(install?.notes ?? '');
  const [nextCode, setNextCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cats = useMemo(() => categories, [categories]);

  useEffect(() => {
    if (edit) return;
    getCotNextCode('INSTALACION')
      .then((r) => setNextCode(r.code))
      .catch(() => setNextCode(''));
  }, [edit]);

  const guardar = async () => {
    if (!name.trim()) return setError('Escribe el nombre del servicio.');
    setBusy(true);
    setError('');
    const data = { name: name.trim(), category: category.trim(), subcategory: subcategory.trim(), unitCost: num(unitCost), notes };
    try {
      onSaved(install ? await updateCotInstall(install.id, data) : await createCotInstall(data));
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar el servicio. Revisa los datos e intenta de nuevo.'));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-if-title">
        <div className="modal-header">
          <h3 id="cot-if-title">{edit ? `Editar ${install!.code}` : 'Nuevo servicio de instalación'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="form-group">
            <label>Código</label>
            <input
              value={edit ? install!.code : nextCode ? `${nextCode} (automático)` : '(automático)'}
              readOnly
              style={{ background: '#f1f5f9', color: '#4a5568', cursor: 'not-allowed' }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="cot-if-name">Servicio *</label>
            <input id="cot-if-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cot-if-cat">Categoría</label>
              <input id="cot-if-cat" list="cot-icats" value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="cot-icats">
                {cats.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="cot-if-sub">Subcategoría</label>
              <input id="cot-if-sub" list="cot-isubs" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
              <datalist id="cot-isubs">
                {subcategories.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="cot-if-cost">Costo ($)</label>
            <input id="cot-if-cost" type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="cot-if-notes">Observaciones</label>
            <textarea id="cot-if-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="auth-btn" onClick={guardar} disabled={busy}>
            {busy ? 'Guardando...' : edit ? 'Guardar cambios' : 'Crear servicio'}
          </button>
        </div>
      </div>
    </div>
  );
}
