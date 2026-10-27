import { useState, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { getUnitConfig, createUnitConfig, updateUnitConfig, deleteUnitConfig } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

const FORM_VACIO = { name: '', displayName: '', kgPerUnit: '', isDefault: false };

/**
 * Cuánto pesa un saco en esta empresa. Las toneladas (1000 kg), los quintales (100 libras) y los kilos son universales; el saco
 * cambia de una empresa a otra, y sin él no se puede registrar ni embarcar en sacos.
 */
export default function UnidadesPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [unidades, setUnidades] = useState<any[]>([]);
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
    getUnitConfig().then(setUnidades).catch(() => setError('No se pudieron cargar las unidades.')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const sinSaco = !loading && !unidades.some((u) => u.isDefault);

  function resetForm() {
    setForm(FORM_VACIO);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function startEdit(u: any) {
    setForm({ name: u.name, displayName: u.displayName, kgPerUnit: String(u.kgPerUnit), isDefault: !!u.isDefault });
    setEditingId(u.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit() {
    const kg = form.kgPerUnit.trim() === '' ? NaN : Number(form.kgPerUnit);
    if (!form.displayName.trim()) { setError('El nombre es requerido'); return; }
    if (Number.isNaN(kg) || kg <= 0) { setError('El peso por unidad debe ser mayor a cero'); return; }
    setSaving(true);
    setError('');
    try {
      const nombre = form.name.trim() || form.displayName.trim().toUpperCase().replace(/\s+/g, '_');
      const data = { name: nombre, displayName: form.displayName.trim(), kgPerUnit: kg, isDefault: form.isDefault };
      if (editingId) await updateUnitConfig(editingId, data);
      else await createUnitConfig(data);
      resetForm();
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo guardar la unidad. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  async function marcarPorDefecto(id: number) {
    setError('');
    try {
      await updateUnitConfig(id, { isDefault: true });
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo cambiar la unidad por defecto.'));
    }
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    try {
      await deleteUnitConfig(id);
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo eliminar la unidad.'));
    }
  }

  return (
    <>
      <div className="config-intro">
        <p>
          Define cuánto pesa un saco en tu empresa. La unidad marcada «Por defecto» es la que se usa al registrar
          recepciones y embarques en sacos. Las toneladas (1.000 kg), los quintales (100 libras, 45,36 kg) y los kilogramos no necesitan configuración.
        </p>
        <button className="auth-btn" onClick={() => requiere('cree la unidad de medida', () => { resetForm(); setShowForm(true); })}>+ Nueva unidad</button>
      </div>

      {sinSaco && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #f6e05e', borderRadius: '8px', fontSize: '13px', color: '#975a16', marginBottom: '16px' }}>
          Todavía no configuraste el peso del saco, así que no se puede registrar ni embarcar en sacos. Crea una unidad con
          lo que pesa tu saco (por ejemplo 70 kg): la primera que crees queda como la unidad por defecto.
        </div>
      )}

      {!showForm && <ErrorBanner mensaje={error} />}

      {showForm && (
        <div className="page-card" style={{ marginBottom: '16px' }}>
          <div className="cacao-form">
            <ErrorBanner mensaje={error} />
            <div className="form-section-title">{editingId ? 'Editar unidad' : 'Nueva unidad'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" maxLength={80} placeholder="Ej: Saco estándar" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Peso por unidad (kg) *</label>
                <input type="number" step="0.01" min="0" value={form.kgPerUnit} onChange={(e) => setForm({ ...form, kgPerUnit: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                  Usar como unidad por defecto
                </label>
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
          <div className="loading-state">Cargando unidades...</div>
        ) : unidades.length === 0 ? (
          <div className="empty-state">Aún no hay unidades configuradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Peso por unidad</th>
                  <th>Por defecto</th>
                  <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <tr key={u.id}>
                    <td className="tasks-table-title">{u.displayName}</td>
                    <td>{u.kgPerUnit} kg</td>
                    <td>
                      {u.isDefault ? (
                        <span className="status-badge" style={{ backgroundColor: '#c6f6d5', color: '#276749' }}>Por defecto</span>
                      ) : (
                        <button className="btn-sm-edit" onClick={() => requiere('cambie la unidad por defecto', () => marcarPorDefecto(u.id))}>Marcar por defecto</button>
                      )}
                    </td>
                    <td className="col-acciones">
                      <div className="tools-actions-cell">
                        <button className="btn-secondary icon-btn" onClick={() => requiere('edite la unidad de medida', () => startEdit(u))} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
                        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => requiere('elimine la unidad de medida', () => setConfirmandoEliminar(u.id))} disabled={u.isDefault} title={u.isDefault ? 'No se puede eliminar la unidad por defecto' : 'Eliminar unidad'} aria-label="Eliminar unidad"><Trash2 size={14} /></button>
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
          title="Eliminar unidad"
          message="¿Eliminar esta unidad de medida?"
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
