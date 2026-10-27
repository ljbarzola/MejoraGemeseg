import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { getClients, createClient, updateClient, deleteClient } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Trash2, Pencil } from 'lucide-react';
import { useTablaCacao } from '../useTablaCacao';

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', country: '', contact: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<number | null>(null);

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

  function handleDelete(id: number) {
    setConfirmandoEliminar(id);
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    try { await deleteClient(id); load(); } catch {}
  }

  const { tabla, selectorColumnas } = useTablaCacao<any>({
    clave: 'clientes',
    filas: clients,
    idFila: (c) => c.id,
    ordenInicial: 'nombre',
    principal: { key: 'nombre', ancho: 220, label: 'Nombre', clase: 'tasks-table-title', orden: (c) => c.name, celda: (c) => c.name },
    columnas: [
      { key: 'pais', ancho: 120, label: 'País', orden: (c) => c.country, celda: (c) => c.country || '—' },
      { key: 'contacto', ancho: 160, label: 'Contacto', orden: (c) => c.contact, celda: (c) => c.contact || '—' },
      { key: 'email', ancho: 220, label: 'Email', orden: (c) => c.email, celda: (c) => c.email || '—' },
      { key: 'telefono', ancho: 130, label: 'Teléfono', orden: (c) => c.phone, celda: (c) => c.phone || '—' },
    ],
    acciones: (c) => (
      <div className="tools-actions-cell">
        <button className="btn-secondary icon-btn" onClick={() => startEdit(c)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDelete(c.id)} title="Eliminar cliente" aria-label="Eliminar cliente"><Trash2 size={14} /></button>
      </div>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Clientes"
        description="Los compradores y exportadores a los que les vendes tu cacao."
        actions={
          <>
            <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Cliente</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields" />
        <div className="filter-bar-actions">{selectorColumnas}</div>
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

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="empty-state">No hay clientes registrados.</div>
        ) : (
          tabla
        )}
      </div>

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          title="Eliminar cliente"
          message="¿Eliminar este cliente?"
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
