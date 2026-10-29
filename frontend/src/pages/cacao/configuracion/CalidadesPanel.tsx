import { useState, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { getQualities, createQuality, updateQuality, deleteQuality } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import FormModal from '../../../components/common/FormModal';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

const FORM_VACIO = { name: '', humidityDiscount: '', impurityDiscount: '', isFixedPrice: false, fixedPrice: '' };

/** Un número escrito en un campo; vacío o inválido da NaN (un 0 es un valor válido). */
const numero = (t: string) => (t.trim() === '' ? NaN : Number(t));

/**
 * Calidades de cacao de la empresa y sus descuentos. Cada empresa define las suyas: empieza sin
 * ninguna y los porcentajes no traen valores de fábrica.
 */
export default function CalidadesPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [qualities, setQualities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<number | null>(null);
  // Quien no puede editar ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const requiere = (accion: string, fn: () => void) => (puedeEditar ? fn() : setSoloAdmin(accion));

  const load = () => {
    setLoading(true);
    getQualities().then(setQualities).catch(() => setError('No se pudieron cargar las calidades.')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm(FORM_VACIO);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  async function handleSubmit() {
    const humedad = numero(form.humidityDiscount);
    const impurezas = numero(form.impurityDiscount);
    const precio = numero(form.fixedPrice);
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (Number.isNaN(humedad) || humedad < 0 || humedad > 100) { setError('El descuento por humedad debe estar entre 0 y 100'); return; }
    if (Number.isNaN(impurezas) || impurezas < 0 || impurezas > 100) { setError('El descuento por impurezas debe estar entre 0 y 100'); return; }
    if (form.isFixedPrice && (Number.isNaN(precio) || precio <= 0)) { setError('Si el precio es fijo, debes indicar el monto'); return; }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: form.name.trim(),
        humidityDiscount: humedad,
        impurityDiscount: impurezas,
        isFixedPrice: form.isFixedPrice,
        fixedPrice: form.isFixedPrice ? precio : null,
      };
      if (editingId) await updateQuality(editingId, data);
      else await createQuality(data);
      resetForm();
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo guardar la calidad. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  function startEdit(q: any) {
    setForm({
      name: q.name,
      humidityDiscount: String(q.humidityDiscount ?? ''),
      impurityDiscount: String(q.impurityDiscount ?? ''),
      isFixedPrice: !!q.isFixedPrice,
      fixedPrice: q.fixedPrice != null ? String(q.fixedPrice) : '',
    });
    setEditingId(q.id);
    setShowForm(true);
    setError('');
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    try {
      await deleteQuality(id);
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo eliminar la calidad.'));
    }
  }

  return (
    <>
      <div className="config-intro">
        <p>
          Cada calidad define cuánto se descuenta del peso por humedad e impurezas al liquidar a un proveedor.
          Estos porcentajes son los de tu empresa: el sistema no trae ninguno de fábrica.
        </p>
        <button className="auth-btn" onClick={() => requiere('cree la calidad', () => { resetForm(); setShowForm(true); })}>+ Nueva calidad</button>
      </div>

      {!showForm && <ErrorBanner mensaje={error} />}

      {showForm && (
        <FormModal
          title={editingId ? 'Editar calidad' : 'Nueva calidad'}
          descripcion="Cuánto se descuenta del peso por humedad e impurezas al liquidar este tipo de cacao."
          submitLabel={editingId ? 'Guardar cambios' : 'Crear calidad'}
          saving={saving}
          error={error}
          onClose={resetForm}
          onSubmit={handleSubmit}
        >
          <div className="form-group">
            <label htmlFor="cal-nombre">Nombre *</label>
            <input id="cal-nombre" type="text" maxLength={80} autoComplete="off" placeholder="Ej: CCN-51, Nacional, Orgánico" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cal-humedad">Descuento por humedad (%) *</label>
              <input id="cal-humedad" type="number" inputMode="decimal" step="0.1" min="0" max="100" value={form.humidityDiscount} onChange={(e) => setForm({ ...form, humidityDiscount: e.target.value })} />
              <span style={{ fontSize: '11px', color: '#718096' }}>Porcentaje que se descuenta del peso por humedad</span>
            </div>
            <div className="form-group">
              <label htmlFor="cal-impurezas">Descuento por impurezas (%) *</label>
              <input id="cal-impurezas" type="number" inputMode="decimal" step="0.1" min="0" max="100" value={form.impurityDiscount} onChange={(e) => setForm({ ...form, impurityDiscount: e.target.value })} />
              <span style={{ fontSize: '11px', color: '#718096' }}>Porcentaje que se descuenta del peso por impurezas</span>
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={form.isFixedPrice} onChange={(e) => setForm({ ...form, isFixedPrice: e.target.checked })} />
              Precio fijo (no requiere fijación)
            </label>
          </div>
          {form.isFixedPrice && (
            <div className="form-group">
              <label htmlFor="cal-precio">Precio fijo ($/kg) *</label>
              <input id="cal-precio" type="number" inputMode="decimal" step="0.01" min="0" value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} />
            </div>
          )}
        </FormModal>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando calidades...</div>
        ) : qualities.length === 0 ? (
          <div className="empty-state">Aún no hay calidades. Crea la primera para poder registrar recepciones.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Desc. humedad</th>
                  <th>Desc. impurezas</th>
                  <th>Tipo de precio</th>
                  <th>Precio fijo</th>
                  <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
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
                    <td className="col-acciones">
                      <div className="tools-actions-cell">
                        <button className="btn-secondary icon-btn" onClick={() => requiere('edite la calidad', () => startEdit(q))} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
                        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => requiere('elimine la calidad', () => setConfirmandoEliminar(q.id))} title="Eliminar calidad" aria-label="Eliminar calidad"><Trash2 size={14} /></button>
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
          title="Eliminar calidad"
          message="¿Eliminar esta calidad? Si ya tiene lotes no se podrá eliminar."
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}
