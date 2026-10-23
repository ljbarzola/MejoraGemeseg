import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { getClients, createClient, updateClient, deleteClient } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Trash2, Pencil } from 'lucide-react';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

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

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const cf = useColumnFilters<any>(clients, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (c) => c.name },
    { key: 'pais', etiqueta: 'País', tipo: 'valores', vacio: 'Sin país', getValues: (c) => c.country },
    { key: 'contacto', etiqueta: 'Contacto', tipo: 'texto', getValue: (c) => c.contact },
    { key: 'email', etiqueta: 'Email', tipo: 'texto', getValue: (c) => c.email },
    { key: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', getValue: (c) => c.phone },
  ]);
  const filas = cf.filas;

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
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre<ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  <th>País<ColumnFilter cf={cf} col="pais" orden={cf.ordenDe('pais')} /></th>
                  <th>Contacto<ColumnFilter cf={cf} col="contacto" orden={cf.ordenDe('contacto')} /></th>
                  <th>Email<ColumnFilter cf={cf} col="email" orden={cf.ordenDe('email')} /></th>
                  <th>Teléfono<ColumnFilter cf={cf} col="telefono" orden={cf.ordenDe('telefono')} /></th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={6} mensaje="No hay clientes que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td className="tasks-table-title">{c.name}</td>
                    <td>{c.country || '—'}</td>
                    <td>{c.contact || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <div className="tools-actions-cell">
                        <button className="btn-secondary icon-btn" onClick={() => startEdit(c)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
                        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDelete(c.id)} title="Eliminar cliente" aria-label="Eliminar cliente"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
