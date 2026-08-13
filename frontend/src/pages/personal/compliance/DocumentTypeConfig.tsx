import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType } from '../../../services/personal.service';

export default function DocumentTypeConfig() {
  const navigate = useNavigate();
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', folder: 'CUSTODIAS', required: true });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getDocumentTypes().then(setDocTypes).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await updateDocumentType(editingId, form);
      } else {
        await createDocumentType(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', folder: 'CUSTODIAS', required: true });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (dt: any) => {
    setEditingId(dt.id);
    setForm({ name: dt.name, folder: dt.folder, required: dt.required });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este tipo de documento?')) return;
    try {
      await deleteDocumentType(id);
      load();
    } catch {
    }
  };

  const custodiasTypes = docTypes.filter((d) => d.folder === 'CUSTODIAS');
  const personalTypes = docTypes.filter((d) => d.folder === 'PERSONAL');

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MODULO PERSONAL</p>
          <h1>Configuración de Requisitos</h1>
          <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: '4px' }}>
            Define qué documentos son requeridos para cada tipo de carpeta
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <button className="auth-btn" onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', folder: 'CUSTODIAS', required: true }); }}>
            + Nuevo Requisito
          </button>
        </div>
      </div>

      {showForm && (
        <div className="admin-section" style={{ maxWidth: '500px', marginTop: '20px' }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>
            {editingId ? 'Editar Requisito' : 'Nuevo Requisito'}
          </h3>
          {error && (
            <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#c53030', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="cacao-form">
            <div className="form-group">
              <label>Nombre del documento *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Cédula, Contrato, Nivel 1..."
              />
            </div>
            <div className="form-group">
              <label>Carpeta *</label>
              <select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })}>
                <option value="CUSTODIAS">🛡️ Custodias</option>
                <option value="PERSONAL">👤 Personal Administrativo</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  style={{ width: '16px', height: '16px' }}
                />
                Requerido
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="auth-btn" disabled={saving}>
                {saving ? '⏳ Guardando...' : editingId ? '💾 Actualizar' : '💾 Crear'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Cargando requisitos...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
          <div className="admin-section">
            <h3 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>🛡️ Custodias ({custodiasTypes.length})</h3>
            {custodiasTypes.length === 0 ? (
              <p style={{ color: '#a0aec0', textAlign: 'center', padding: '24px' }}>No hay requisitos definidos</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {custodiasTypes.map((dt) => (
                  <div
                    key={dt.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: '8px', background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>
                        {dt.name}
                      </span>
                      {dt.required && (
                        <span style={{ fontSize: '0.7rem', background: '#fed7d7', color: '#c53030', padding: '2px 6px', borderRadius: '4px' }}>
                          REQUERIDO
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-sm-edit" onClick={() => handleEdit(dt)}>✏️</button>
                      <button className="btn-danger-sm" onClick={() => handleDelete(dt.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-section">
            <h3 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>👤 Personal Administrativo ({personalTypes.length})</h3>
            {personalTypes.length === 0 ? (
              <p style={{ color: '#a0aec0', textAlign: 'center', padding: '24px' }}>No hay requisitos definidos</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {personalTypes.map((dt) => (
                  <div
                    key={dt.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: '8px', background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>
                        {dt.name}
                      </span>
                      {dt.required && (
                        <span style={{ fontSize: '0.7rem', background: '#fed7d7', color: '#c53030', padding: '2px 6px', borderRadius: '4px' }}>
                          REQUERIDO
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-sm-edit" onClick={() => handleEdit(dt)}>✏️</button>
                      <button className="btn-danger-sm" onClick={() => handleDelete(dt.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
