import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getClients, createClient, updateClient, deleteClient } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import FormModal from '../../../components/common/FormModal';
import ErrorBanner from '../../../components/common/ErrorBanner';
import { apiErrorMessage } from '../utils';
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
  // Un error al eliminar (p. ej. el cliente ya tiene embarques) se muestra sobre la lista.
  const [errorLista, setErrorLista] = useState('');

  const load = () => {
    setLoading(true);
    getClients().then(setClients).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setErrorLista('');
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
      setError(apiErrorMessage(err, 'No se pudo guardar el cliente. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  function startEdit(c: any) {
    setErrorLista('');
    setForm({ name: c.name, country: c.country || '', contact: c.contact || '', email: c.email || '', phone: c.phone || '' });
    setEditingId(c.id);
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
    try { await deleteClient(id); load(); } catch (err: any) {
      setErrorLista(apiErrorMessage(err, 'No se pudo eliminar el cliente. Si ya tiene embarques, no se puede borrar.'));
    }
  }

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'clientes',
    filas: clients,
    idFila: (c) => c.id,
    ordenInicial: 'nombre',
    principal: { key: 'nombre', filtro: { tipo: 'texto', getValue: (c) => c.name }, ancho: 220, label: 'Nombre', clase: 'tasks-table-title', orden: (c) => c.name, celda: (c) => c.name },
    columnas: [
      { key: 'pais', filtro: { tipo: 'valores', vacio: 'Sin país', getValues: (c) => c.country }, ancho: 120, label: 'País', orden: (c) => c.country, celda: (c) => c.country || '—' },
      { key: 'contacto', filtro: { tipo: 'texto', getValue: (c) => c.contact }, ancho: 160, label: 'Contacto', orden: (c) => c.contact, celda: (c) => c.contact || '—' },
      { key: 'email', filtro: { tipo: 'texto', getValue: (c) => c.email }, ancho: 220, label: 'Email', orden: (c) => c.email, celda: (c) => c.email || '—' },
      { key: 'telefono', filtro: { tipo: 'texto', getValue: (c) => c.phone }, ancho: 130, label: 'Teléfono', orden: (c) => c.phone, celda: (c) => c.phone || '—' },
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
            <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo cliente</button>
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
          title={editingId ? 'Editar cliente' : 'Nuevo cliente'}
          descripcion="El comprador o exportador al que le vendes cacao. Solo el nombre es obligatorio."
          submitLabel={editingId ? 'Guardar cambios' : 'Crear cliente'}
          saving={saving}
          error={error}
          onClose={resetForm}
          onSubmit={handleSubmit}
        >
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cli-nombre">Nombre *</label>
              <input id="cli-nombre" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Chocolates del Mundo S.A." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="cli-pais">País</label>
              <input id="cli-pais" type="text" maxLength={80} autoComplete="off" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cli-contacto">Persona de contacto</label>
              <input id="cli-contacto" type="text" maxLength={120} autoComplete="off" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="cli-telefono">Teléfono</label>
              <input id="cli-telefono" type="tel" inputMode="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="cli-email">Correo electrónico</label>
            <input id="cli-email" type="email" maxLength={160} autoComplete="off" spellCheck={false} placeholder="nombre@empresa.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </FormModal>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="empty-state">Todavía no tienes clientes. Crea el primero con «+ Nuevo cliente» para poder registrar embarques.</div>
        ) : (
          tabla
        )}
      </div>

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          title="Eliminar cliente"
          message={`¿Eliminar a «${clients.find((x) => x.id === confirmandoEliminar)?.name ?? 'este cliente'}»? Solo se puede si no tiene embarques.`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
