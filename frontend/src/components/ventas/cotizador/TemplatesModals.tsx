import { useMemo, useState } from 'react';
import { Eye, FolderInput, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import { computeQuote } from '../../../utils/cotizador/pricing';
import { money } from '../../../utils/cotizador/format';
import type { CotProduct, CotTemplate } from '../../../utils/cotizador/types';
import { isKitLine, isInstallLine } from '../../../utils/cotizador/types';
import QuoteTotals from './QuoteTotals';

const TAMANOS = [
  ['pequeña', 'Pequeña'],
  ['mediana', 'Mediana'],
  ['grande', 'Grande'],
];
const INDUSTRIAS = [
  ['comercio', 'Comercio'],
  ['banco', 'Banco'],
  ['oficina', 'Oficina'],
  ['industrial', 'Industrial'],
  ['salud', 'Salud'],
];

const totalDe = (t: CotTemplate, byCode: ReadonlyMap<string, CotProduct>) =>
  computeQuote({
    items: t.items,
    catalog: byCode,
    supplierMargins: t.supplierMargins ?? {},
    installMargin: t.installMargin,
    discountType: 'none',
    discountValue: 0,
  });

const contarProductos = (t: CotTemplate) =>
  t.items.reduce((n, l) => n + (isKitLine(l) ? l.kitComponents.length : isInstallLine(l) ? 0 : 1), 0);

// ---------------------------------------------------------------------------
// Lista de plantillas
// ---------------------------------------------------------------------------

export function TemplatesModal({
  templates,
  loading,
  error,
  byCode,
  onClose,
  onLoad,
  onDelete,
}: {
  templates: CotTemplate[];
  loading: boolean;
  error: string;
  byCode: ReadonlyMap<string, CotProduct>;
  onClose: () => void;
  onLoad: (t: CotTemplate) => void;
  onDelete: (t: CotTemplate) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [tam, setTam] = useState('');
  const [ind, setInd] = useState('');
  const [preview, setPreview] = useState<CotTemplate | null>(null);
  const [aEliminar, setAEliminar] = useState<CotTemplate | null>(null);
  const [errorLocal, setErrorLocal] = useState('');

  const filtradas = useMemo(() => {
    const t = q.toLowerCase().trim();
    return templates.filter(
      (x) =>
        (!t || x.name.toLowerCase().includes(t) || x.description.toLowerCase().includes(t)) &&
        (!tam || x.clientType === tam) &&
        (!ind || x.industry === ind),
    );
  }, [templates, q, tam, ind]);

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    try {
      await onDelete(aEliminar);
      setAEliminar(null);
    } catch {
      setAEliminar(null);
      setErrorLocal('No se pudo eliminar la plantilla. Intenta de nuevo.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 860, width: '96vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-tpl-title"
      >
        <div className="modal-header">
          <h3 id="cot-tpl-title">📋 Plantillas de cotización</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error || errorLocal} />
          <div className="cot-filters" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plantilla..." aria-label="Buscar plantilla" />
            <select value={tam} onChange={(e) => setTam(e.target.value)} aria-label="Filtrar por tamaño de plantilla">
              <option value="">Todos los tamaños</option>
              {TAMANOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={ind} onChange={(e) => setInd(e.target.value)} aria-label="Filtrar por industria">
              <option value="">Todas las industrias</option>
              {INDUSTRIAS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {loading && <p className="cot-muted">Cargando plantillas...</p>}
          {!loading && filtradas.length === 0 && (
            <div className="cot-empty">
              <div className="cot-empty-icon">📋</div>
              {templates.length === 0
                ? 'Aún no hay plantillas. Guarda una cotización como plantilla para reutilizarla.'
                : 'No hay plantillas con esos filtros.'}
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {filtradas.map((t) => (
              <div className="cot-prod" key={t.id}>
                <div className="cot-prod-info">
                  <div className="cot-prod-name">{t.name}</div>
                  {t.description && <div className="cot-muted" style={{ marginBottom: 5 }}>{t.description}</div>}
                  <div className="cot-chips">
                    <span className="cot-chip">{t.clientType}</span>
                    <span className="cot-chip">{t.industry}</span>
                    <span className="cot-chip">{contarProductos(t)} productos</span>
                    {t.isSample && <span className="cot-chip annual">ejemplo</span>}
                    {t.createdByName && <span className="cot-muted">por {t.createdByName}</span>}
                  </div>
                </div>
                <div className="cot-prod-side" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary icon-btn" title="Vista previa" aria-label="Vista previa" onClick={() => setPreview(t)}>
                    <Eye size={15} />
                  </button>
                  <button type="button" className="btn-secondary icon-btn" title="Cargar plantilla" aria-label="Cargar plantilla" onClick={() => onLoad(t)}>
                    <FolderInput size={15} />
                  </button>
                  <button type="button" className="btn-secondary icon-btn" title="Eliminar plantilla" aria-label="Eliminar plantilla" onClick={() => setAEliminar(t)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {preview && <TemplatePreview t={preview} byCode={byCode} onClose={() => setPreview(null)} onLoad={() => onLoad(preview)} />}
      {aEliminar && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message={`¿Eliminar la plantilla "${aEliminar.name}"?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista previa de una plantilla
// ---------------------------------------------------------------------------

function TemplatePreview({
  t,
  byCode,
  onClose,
  onLoad,
}: {
  t: CotTemplate;
  byCode: ReadonlyMap<string, CotProduct>;
  onClose: () => void;
  onLoad: () => void;
}) {
  const comp = totalDe(t, byCode);
  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-tp-title">
        <div className="modal-header">
          <h3 id="cot-tp-title">{t.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {t.description && <p className="cot-muted" style={{ marginTop: 0 }}>{t.description}</p>}
          <div className="cot-table-wrap">
            <table className="cot-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Producto</th>
                  <th className="center">Cant</th>
                  <th className="right">PVP</th>
                </tr>
              </thead>
              <tbody>
                {comp.lines.flatMap((l, i) => {
                  if (l.kind === 'product') {
                    return [
                      <tr key={i} className={l.missing ? 'missing' : undefined}>
                        <td className="num">{i + 1}</td>
                        <td>
                          {l.item?.name ?? `Producto no encontrado (${l.line.code})`}
                          <br />
                          <small>{l.line.code}</small>
                        </td>
                        <td className="center">{l.line.qty}</td>
                        <td className="right">{money(l.pvpTotal)}</td>
                      </tr>,
                    ];
                  }
                  if (l.kind === 'kit') {
                    return [
                      <tr key={`k${i}`} className="kit-row">
                        <td className="num">📦</td>
                        <td colSpan={2}>{l.line.kitName}</td>
                        <td className="right">{money(l.pvpTotal)}</td>
                      </tr>,
                    ];
                  }
                  return [
                    <tr key={`i${i}`}>
                      <td className="num">🔧</td>
                      <td>{l.line.description}</td>
                      <td className="center">{l.line.qty}</td>
                      <td className="right">{money(l.pvpTotal)}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <QuoteTotals totals={comp.totals} discountType="none" discountValue={0} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button className="auth-btn" onClick={onLoad}>
            Cargar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guardar la cotización actual como plantilla
// ---------------------------------------------------------------------------

export function SaveTemplateModal({
  defaultName,
  onCancel,
  onSave,
}: {
  defaultName: string;
  onCancel: () => void;
  onSave: (data: { name: string; description: string; clientType: string; industry: string }) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [clientType, setClientType] = useState('mediana');
  const [industry, setIndustry] = useState('comercio');
  const [otra, setOtra] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    const ind = industry === '__otra__' ? otra.trim().toLowerCase() : industry;
    if (!name.trim()) return setError('Escribe el nombre de la plantilla.');
    if (!ind) return setError('Escribe la industria.');
    setBusy(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description: description.trim(), clientType, industry: ind });
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'No se pudo guardar la plantilla. Intenta de nuevo.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-st-title">
        <div className="modal-header">
          <h3 id="cot-st-title">Guardar como plantilla</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="form-group">
            <label htmlFor="cot-tpl-name">Nombre de la plantilla *</label>
            <input id="cot-tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Banco - Sistema Integral" />
          </div>
          <div className="form-group">
            <label htmlFor="cot-tpl-desc">Descripción</label>
            <input id="cot-tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción breve del alcance" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cot-tpl-type">Tamaño del cliente</label>
              <select id="cot-tpl-type" value={clientType} onChange={(e) => setClientType(e.target.value)}>
                {TAMANOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cot-tpl-ind">Industria</label>
              <select id="cot-tpl-ind" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                {INDUSTRIAS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="__otra__">+ Escribir otra opción...</option>
              </select>
              {industry === '__otra__' && (
                <input style={{ marginTop: 6 }} value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="Escribe la industria..." aria-label="Industria personalizada" />
              )}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="auth-btn" onClick={guardar} disabled={busy}>
            {busy ? 'Guardando...' : '💾 Guardar plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}
