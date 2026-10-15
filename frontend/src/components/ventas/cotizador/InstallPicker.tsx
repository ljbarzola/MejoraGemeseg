import { useMemo, useState } from 'react';
import type { CotInstall } from '../../../utils/cotizador/types';
import { money } from '../../../utils/cotizador/format';

interface Props {
  installs: CotInstall[];
  onPick: (s: CotInstall) => void;
  onClose: () => void;
}

export default function InstallPicker({ installs, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');

  const cats = useMemo(
    () => [...new Set(installs.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [installs],
  );
  const subs = useMemo(
    () =>
      [...new Set(installs.filter((i) => !cat || i.category === cat).map((i) => i.subcategory).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'es'),
      ),
    [installs, cat],
  );
  const filtered = installs.filter((s) => {
    const t = q.toLowerCase().trim();
    if (t && !s.name.toLowerCase().includes(t) && !s.notes.toLowerCase().includes(t)) return false;
    if (cat && s.category !== cat) return false;
    if (sub && s.subcategory !== sub) return false;
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-ip-title"
      >
        <div className="modal-header">
          <h3 id="cot-ip-title">🔧 Servicios de instalación</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cot-filters" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar servicio..."
              aria-label="Buscar servicio de instalación"
            />
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setSub('');
              }}
              aria-label="Categoría"
            >
              <option value="">Todas las categorías</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subcategoría">
              <option value="">Todas las subcategorías</option>
              {subs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {installs.length === 0 && (
            <div className="cot-empty">
              <div className="cot-empty-icon">🔧</div>
              No hay servicios de instalación disponibles.
              <div className="cot-muted">Créalos en Catálogo → Instalaciones.</div>
            </div>
          )}
          {installs.length > 0 && filtered.length === 0 && (
            <div className="cot-empty">
              <div className="cot-empty-icon">🔍</div>
              No se encontraron servicios.
            </div>
          )}
          <div className="cot-install-grid">
            {filtered.map((s) => (
              <button type="button" key={s.code} className="cot-install-card" onClick={() => onPick(s)}>
                <div className="desc">{s.name}</div>
                <div className="meta">
                  {s.category}
                  {s.subcategory ? ` › ${s.subcategory}` : ''}
                </div>
                <div className="cost">{money(s.unitCost)}</div>
              </button>
            ))}
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
