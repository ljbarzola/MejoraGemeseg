import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import FormModal from '../../../components/common/FormModal';
import ErrorBanner from '../../../components/common/ErrorBanner';
import { apiErrorMessage } from '../utils';
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
  // Un error al eliminar (p. ej. el proveedor ya tiene recepciones) se muestra sobre la lista.
  const [errorLista, setErrorLista] = useState('');

  const load = () => {
    setLoading(true);
    getSuppliers().then(setSuppliers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setErrorLista('');
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
      setError(apiErrorMessage(err, 'No se pudo guardar el proveedor. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  function startEdit(s: any) {
    setErrorLista('');
    setForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', paymentTerms: s.paymentTerms || '', bank: s.bank || '' });
    setEditingId(s.id);
    setError('');
    setShowForm(true);
  }

  function handleDelete(id: number) {
    setConfirmandoEliminar(id);
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    setErrorLista('');
    try { await deleteSupplier(id); load(); } catch (err: any) {
      setErrorLista(apiErrorMessage(err, 'No se pudo eliminar el proveedor. Si ya tiene recepciones o liquidaciones, no se puede borrar.'));
    }
  }

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'proveedores',
    filas: suppliers,
    idFila: (s) => s.id,
    ordenInicial: 'nombre',
    principal: { key: 'nombre', filtro: { tipo: 'texto', getValue: (s) => s.name }, ancho: 220, label: 'Nombre', clase: 'tasks-table-title', orden: (s) => s.name, celda: (s) => s.name },
    columnas: [
      { key: 'contacto', filtro: { tipo: 'texto', getValue: (s) => s.contact }, ancho: 160, label: 'Contacto', orden: (s) => s.contact, celda: (s) => s.contact || '—' },
      { key: 'telefono', filtro: { tipo: 'texto', getValue: (s) => s.phone }, ancho: 130, label: 'Teléfono', orden: (s) => s.phone, celda: (s) => s.phone || '—' },
      { key: 'condiciones', filtro: { tipo: 'valores', vacio: 'Sin condiciones', getValues: (s) => s.paymentTerms }, ancho: 160, label: 'Condiciones', orden: (s) => s.paymentTerms, celda: (s) => s.paymentTerms || '—' },
      { key: 'banco', filtro: { tipo: 'valores', vacio: 'Sin banco', getValues: (s) => s.bank }, ancho: 160, label: 'Banco', orden: (s) => s.bank, celda: (s) => s.bank || '—' },
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
            <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo proveedor</button>
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

      <ErrorBanner mensaje={errorLista} />

      {showForm && (
        <FormModal
          title={editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
          descripcion="Quien te vende cacao. Solo el nombre es obligatorio; lo demás ayuda a pagarle."
          submitLabel={editingId ? 'Guardar cambios' : 'Crear proveedor'}
          saving={saving}
          error={error}
          onClose={resetForm}
          onSubmit={handleSubmit}
        >
          <div className="form-group">
            <label htmlFor="prov-nombre">Nombre *</label>
            <input id="prov-nombre" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Hacienda La Esperanza" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-contacto">Persona de contacto</label>
              <input id="prov-contacto" type="text" maxLength={120} autoComplete="off" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="prov-telefono">Teléfono</label>
              <input id="prov-telefono" type="tel" inputMode="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-condiciones">Condiciones de pago</label>
              <input id="prov-condiciones" type="text" maxLength={120} autoComplete="off" placeholder="Ej: 30 días" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="prov-banco">Banco</label>
              <input id="prov-banco" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Banco del Austro" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            </div>
          </div>
        </FormModal>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando proveedores...</div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">Todavía no tienes proveedores. Crea el primero con «+ Nuevo proveedor» para poder registrar sus entregas.</div>
        ) : (
          tabla
        )}
      </div>

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          title="Eliminar proveedor"
          message={`¿Eliminar a «${suppliers.find((x) => x.id === confirmandoEliminar)?.name ?? 'este proveedor'}»? Solo se puede si no tiene recepciones ni liquidaciones.`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
