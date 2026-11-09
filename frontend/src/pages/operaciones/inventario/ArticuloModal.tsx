import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { actualizarArticulo, crearArticulo } from '../../../services/inventario.service';
import type { Articulo, TipoArticulo } from '../../../types/inventario';
import { TIPOS_ARTICULO, TIPO_ARTICULO_LABEL } from '../../../types/inventario';
import { mensajeError } from './inventarioUi';

const AYUDA_VARIANTE: Record<TipoArticulo, string> = {
  UNIFORME: 'Ej: Talla M. Cada talla es un artículo aparte para llevar su propio saldo.',
  IMPLEMENTO: 'Ej: Negro, Grande. Déjalo vacío si no aplica.',
  MUNICION: 'Ej: Calibre 9 mm. Déjalo vacío si no aplica.',
};

/** Crear o editar un artículo del catálogo (uniforme, implemento o munición). El saldo no se escribe aquí: sale de los movimientos. */
export default function ArticuloModal({
  articulo,
  onClose,
  onSaved,
}: {
  articulo: Articulo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoArticulo>(articulo?.tipo ?? 'UNIFORME');
  const [nombre, setNombre] = useState(articulo?.nombre ?? '');
  const [variante, setVariante] = useState(articulo?.variante ?? '');
  const [unidad, setUnidad] = useState(articulo?.unidad ?? 'unidad');
  const [minimo, setMinimo] = useState(String(articulo?.stockMinimo ?? 0));
  const [maximo, setMaximo] = useState(articulo?.stockMaximo != null ? String(articulo.stockMaximo) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre del artículo.');
    const min = Number(minimo || 0);
    const max = maximo.trim() === '' ? null : Number(maximo);
    if (!Number.isInteger(min) || min < 0) return setError('El mínimo debe ser un número entero, cero o más.');
    if (max != null && (!Number.isInteger(max) || max < 0)) return setError('El máximo debe ser un número entero, cero o más.');
    if (max != null && max > 0 && max < min) return setError('El máximo no puede ser menor que el mínimo.');
    setSaving(true);
    setError('');
    try {
      const datos = { nombre: nombre.trim(), variante: variante.trim(), unidad: unidad.trim() || 'unidad', stockMinimo: min, stockMaximo: max };
      if (articulo) await actualizarArticulo(articulo.id, datos);
      else await crearArticulo({ ...datos, tipo });
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el artículo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{articulo ? 'Editar artículo' : 'Nuevo artículo'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>Tipo *</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoArticulo)} disabled={!!articulo}>
                  {TIPOS_ARTICULO.map((t) => <option key={t} value={t}>{TIPO_ARTICULO_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '2 1 260px' }}>
                <label>Nombre *</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Camisa manga larga" required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Talla o variante</label>
                <input type="text" value={variante} onChange={(e) => setVariante(e.target.value)} />
                <small style={{ color: '#718096' }}>{AYUDA_VARIANTE[tipo]}</small>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Unidad</label>
                <input type="text" value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="unidad, caja, par…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Mínimo en bodega</label>
                <input type="number" min="0" step="1" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
                <small style={{ color: '#718096' }}>Al llegar a esta cantidad se avisa por la campana.</small>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Máximo en bodega</label>
                <input type="number" min="0" step="1" value={maximo} onChange={(e) => setMaximo(e.target.value)} placeholder="Opcional" />
                <small style={{ color: '#718096' }}>Con esto se calcula cuánto reponer.</small>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando...' : articulo ? 'Guardar cambios' : 'Crear artículo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
