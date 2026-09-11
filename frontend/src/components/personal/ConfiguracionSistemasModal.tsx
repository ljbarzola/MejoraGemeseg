import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  getSistemasVerificacion,
  createSistemaVerificacion,
  updateSistemaVerificacion,
  deleteSistemaVerificacion,
  type SistemaVerificacion,
} from '../../services/movimiento-personal.service';

interface Props {
  open: boolean;
  onClose: () => void;
}

const initialForm = { nombre: '', urlPortal: '' };

export default function ConfiguracionSistemasModal({ open, onClose }: Props) {
  const [sistemas, setSistemas] = useState<SistemaVerificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getSistemasVerificacion().then(setSistemas).finally(() => setLoading(false));
  };

  useEffect(() => { if (open) load(); }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }

    setSaving(true);
    try {
      const payload = { nombre: form.nombre.trim(), urlPortal: form.urlPortal.trim() || undefined };
      if (editingId) {
        await updateSistemaVerificacion(editingId, payload);
      } else {
        await createSistemaVerificacion(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(initialForm);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s: SistemaVerificacion) => {
    setEditingId(s.id);
    setForm({ nombre: s.nombre, urlPortal: s.urlPortal || '' });
    setShowForm(true);
  };

  const handleToggleActivo = async (s: SistemaVerificacion) => {
    await updateSistemaVerificacion(s.id, { activo: !s.activo });
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este sistema? Los casos ya creados que lo incluyan no se ven afectados.')) return;
    try {
      await deleteSistemaVerificacion(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Configuración de Sistemas de Ingreso/Salida</h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.8rem' }}>
              Sistemas externos (IsyPlus, IESS, SUT, SICOSEP...) que se marcan al ingresar o sacar a un guardia. Esta lista define el checklist de cada caso nuevo.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {showForm ? (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 12px', color: 'var(--azul-oscuro)' }}>
                {editingId ? 'Editar sistema' : 'Nuevo sistema'}
              </h4>
              {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}
              <form onSubmit={handleSubmit} className="cacao-form">
                <div className="form-group">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: IsyPlus, IESS, SUT, SICOSEP..."
                  />
                </div>
                <div className="form-group">
                  <label>Link del portal (opcional)</label>
                  <input
                    type="text"
                    value={form.urlPortal}
                    onChange={(e) => setForm({ ...form, urlPortal: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" className="auth-btn" disabled={saving}>
                    {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button className="auth-btn" style={{ marginBottom: '16px' }} onClick={() => { setShowForm(true); setEditingId(null); setForm(initialForm); }}>
              + Nuevo sistema
            </button>
          )}

          {loading ? (
            <div className="loading-state">Cargando sistemas...</div>
          ) : sistemas.length === 0 ? (
            <div className="empty-state">No hay sistemas configurados todavía. Agrega IsyPlus, IESS, SUT y SICOSEP para empezar.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sistemas.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '8px', background: '#f7fafc',
                    border: '1px solid #e2e8f0', opacity: s.activo ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>{s.nombre}</span>
                    {s.urlPortal && (
                      <a href={s.urlPortal} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#2b6cb0' }}>
                        🔗 portal
                      </a>
                    )}
                    {!s.activo && (
                      <span style={{ fontSize: '0.7rem', background: '#e2e8f0', color: '#4a5568', padding: '2px 6px', borderRadius: '4px' }}>
                        INACTIVO
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleToggleActivo(s)}>
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn-sm-edit" onClick={() => handleEdit(s)}>✏️</button>
                    <button className="btn-danger-sm" onClick={() => handleDelete(s.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
