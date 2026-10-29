import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Trash2, Pencil } from 'lucide-react';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', paymentTerms: '', bank: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getSuppliers().then(setSuppliers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm({ name: '', contact: '', phone: '', paymentTerms: '', bank: '' });
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
        await updateSupplier(editingId, form);
      } else {
        await createSupplier(form);
      }
      resetForm();
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally { setSaving(false); }
  }

  function startEdit(s: any) {
    setForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', paymentTerms: s.paymentTerms || '', bank: s.bank || '' });
    setEditingId(s.id);
    setShowForm(true);
  }

  function handleDelete(id: number) {
    setConfirmandoEliminar(id);
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    try { await deleteSupplier(id); load(); } catch {}
  }

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const cf = useColumnFilters<any>(suppliers, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (s) => s.name },
    { key: 'contacto', etiqueta: 'Contacto', tipo: 'texto', getValue: (s) => s.contact },
    { key: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', getValue: (s) => s.phone },
    { key: 'condiciones', etiqueta: 'Condiciones', tipo: 'valores', vacio: 'Sin condiciones', getValues: (s) => s.paymentTerms },
    { key: 'banco', etiqueta: 'Banco', tipo: 'valores', vacio: 'Sin banco', getValues: (s) => s.bank },
  ]);
  const filas = cf.filas;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Proveedores</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Proveedor</button>
      </div>

      {showForm && (
        <div className="page-card" style={{ marginBottom: '16px' }}>
          <div className="cacao-form">
            {error && <div className="auth-error-banner">{error}</div>}
            <div className="form-section-title">{editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Contacto</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Teléfono</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Condiciones de Pago</label>
                <input type="text" placeholder="Ej: 30 días" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ maxWidth: '50%' }}>
                <label>Banco</label>
                <input type="text" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
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
          <div className="loading-state">Cargando proveedores...</div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">No hay proveedores registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre<ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  <th>Contacto<ColumnFilter cf={cf} col="contacto" orden={cf.ordenDe('contacto')} /></th>
                  <th>Teléfono<ColumnFilter cf={cf} col="telefono" orden={cf.ordenDe('telefono')} /></th>
                  <th>Condiciones<ColumnFilter cf={cf} col="condiciones" orden={cf.ordenDe('condiciones')} /></th>
                  <th>Banco<ColumnFilter cf={cf} col="banco" orden={cf.ordenDe('banco')} /></th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={6} mensaje="No hay proveedores que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((s) => (
                  <tr key={s.id}>
                    <td className="tasks-table-title">{s.name}</td>
                    <td>{s.contact || '—'}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.paymentTerms || '—'}</td>
                    <td>{s.bank || '—'}</td>
                    <td>
                      <div className="tools-actions-cell">
                        <button className="btn-secondary icon-btn" onClick={() => startEdit(s)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
                        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDelete(s.id)} title="Eliminar proveedor" aria-label="Eliminar proveedor"><Trash2 size={14} /></button>
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
          title="Eliminar proveedor"
          message="¿Eliminar este proveedor?"
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
