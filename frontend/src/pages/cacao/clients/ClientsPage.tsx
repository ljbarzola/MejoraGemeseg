import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients, createClient, updateClient, deleteClient } from '../../../services/cacao.service';

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', country: '', contact: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getClients().then(setClients).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm({ name: '', country: '', contact: '', email: '', phone: '' });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateClient(editingId, form);
      } else {
        await createClient(form);
      }
      resetForm();
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally { setSaving(false); }
  }

  function startEdit(c: any) {
    setForm({ name: c.name, country: c.country || '', contact: c.contact || '', email: c.email || '', phone: c.phone || '' });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este cliente?')) return;
    try { await deleteClient(id); load(); } catch {}
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Clientes</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Cliente</button>
      </div>

      {showForm && (
        <div className="page-card" style={{ marginBottom: '16px' }}>
          <div className="cacao-form">
            {error && <div className="auth-error-banner">{error}</div>}
            <div className="form-section-title">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>País</label>
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Contacto</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ maxWidth: '50%' }}>
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
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
          <div className="loading-state">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="empty-state">No hay clientes registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>País</th>
                  <th>Contacto</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="tasks-table-title">{c.name}</td>
                    <td>{c.country || '—'}</td>
                    <td>{c.contact || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <div className="tools-actions-cell">
                        <button className="btn-sm-edit" onClick={() => startEdit(c)}>✎</button>
                        <button className="btn-danger-sm" onClick={() => handleDelete(c.id)}>✕</button>
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
