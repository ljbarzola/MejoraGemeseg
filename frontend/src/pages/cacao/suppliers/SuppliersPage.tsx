import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Trash2, Pencil } from 'lucide-react';
import { useTablaCacao } from '../useTablaCacao';

export default function SuppliersPage() {
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

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'proveedores',
    filas: suppliers,
    idFila: (s) => s.id,
    ordenInicial: 'nombre',
    principal: { key: 'nombre', ancho: 220, label: 'Nombre', clase: 'tasks-table-title', orden: (s) => s.name, celda: (s) => s.name },
    columnas: [
      { key: 'contacto', ancho: 160, label: 'Contacto', orden: (s) => s.contact, celda: (s) => s.contact || '—' },
      { key: 'telefono', ancho: 130, label: 'Teléfono', orden: (s) => s.phone, celda: (s) => s.phone || '—' },
      { key: 'condiciones', ancho: 160, label: 'Condiciones', orden: (s) => s.paymentTerms, celda: (s) => s.paymentTerms || '—' },
      { key: 'banco', ancho: 160, label: 'Banco', orden: (s) => s.bank, celda: (s) => s.bank || '—' },
    ],
    acciones: (s) => (
      <div className="tools-actions-cell">
        <button className="btn-secondary icon-btn" onClick={() => startEdit(s)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDelete(s.id)} title="Eliminar proveedor" aria-label="Eliminar proveedor"><Trash2 size={14} /></button>
      </div>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Proveedores"
        description="Las personas y empresas a las que les compras cacao."
        actions={
          <>
            <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Proveedor</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">{buscador}</div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
        </div>
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
          tabla
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
