import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getQualities, createQuality, updateQuality, deleteQuality } from '../../../services/cacao.service';

export default function QualitiesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [qualities, setQualities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', humidityDiscount: '7', impurityDiscount: '1', isFixedPrice: false, fixedPrice: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getQualities().then(setQualities).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm({ name: '', humidityDiscount: '7', impurityDiscount: '1', isFixedPrice: false, fixedPrice: '' });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (form.isFixedPrice && (!form.fixedPrice || Number(form.fixedPrice) <= 0)) { setError('Si el precio es fijo, debe especificar el monto'); return; }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: form.name,
        humidityDiscount: Number(form.humidityDiscount) || 7,
        impurityDiscount: Number(form.impurityDiscount) || 1,
        isFixedPrice: form.isFixedPrice,
        fixedPrice: form.isFixedPrice ? Number(form.fixedPrice) : null,
      };
      if (editingId) {
        await updateQuality(editingId, data);
      } else {
        await createQuality(data);
      }
      resetForm();
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally { setSaving(false); }
  }

  function startEdit(q: any) {
    setForm({
      name: q.name,
      humidityDiscount: q.humidityDiscount?.toString() || '7',
      impurityDiscount: q.impurityDiscount?.toString() || '1',
      isFixedPrice: q.isFixedPrice || false,
      fixedPrice: q.fixedPrice?.toString() || '',
    });
    setEditingId(q.id);
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta calidad?')) return;
    try { await deleteQuality(id); load(); } catch {}
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Calidades del Cacao</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nueva Calidad</button>
      </div>

      {showForm && (
        <div className="page-card" style={{ marginBottom: '16px' }}>
          <div className="cacao-form">
            {error && <div className="auth-error-banner">{error}</div>}
            <div className="form-section-title">{editingId ? 'Editar Calidad' : 'Nueva Calidad'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" placeholder="Ej: Convencional, Orgánico" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Descuento Humedad (%)</label>
                <input type="number" step="0.1" min="0" max="30" value={form.humidityDiscount} onChange={(e) => setForm({ ...form, humidityDiscount: e.target.value })} />
                <span style={{ fontSize: '11px', color: '#718096' }}>Se descuenta este % del peso neto si la humedad excede</span>
              </div>
              <div className="form-group">
                <label>Descuento Impurezas (%)</label>
                <input type="number" step="0.1" min="0" max="20" value={form.impurityDiscount} onChange={(e) => setForm({ ...form, impurityDiscount: e.target.value })} />
                <span style={{ fontSize: '11px', color: '#718096' }}>Penalización por impurezas</span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={form.isFixedPrice} onChange={(e) => setForm({ ...form, isFixedPrice: e.target.checked })} />
                  Precio fijo (no requiere fijación)
                </label>
              </div>
              {form.isFixedPrice && (
                <div className="form-group">
                  <label>Precio Fijo ($/kg)</label>
                  <input type="number" step="0.01" min="0" value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn-secondary" onClick={resetForm}>Cancelar</button>
              <button className="auth-btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando calidades...</div>
        ) : qualities.length === 0 ? (
          <div className="empty-state">No hay calidades registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Desc. Humedad</th>
                  <th>Desc. Impurezas</th>
                  <th>Tipo Precio</th>
                  <th>Precio Fijo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {qualities.map((q) => (
                  <tr key={q.id}>
                    <td className="tasks-table-title">{q.name}</td>
                    <td>{q.humidityDiscount}%</td>
                    <td>{q.impurityDiscount}%</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: q.isFixedPrice ? '#c6f6d5' : '#fefcbf', color: q.isFixedPrice ? '#276749' : '#975a16' }}>
                        {q.isFixedPrice ? 'Fijo' : 'Provisional'}
                      </span>
                    </td>
                    <td>{q.fixedPrice ? `$${q.fixedPrice}/kg` : '—'}</td>
                    <td>
                      <div className="tools-actions-cell">
                        <button className="btn-sm-edit" onClick={() => startEdit(q)}>✎</button>
                        <button className="btn-danger-sm" onClick={() => handleDelete(q.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
