import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, Settings2 } from 'lucide-react';
import {
  getPersonalFieldDefinitions,
  createPersonalFieldDefinition,
  updatePersonalFieldDefinition,
  deletePersonalFieldDefinition,
  type PersonalFieldDefinition,
  type PersonalFieldType,
  type PersonalFieldScope,
  type PersonalFieldCategory,
} from '../../services/entidades.service';
import ConfirmDialog from '../common/ConfirmDialog';

const TYPE_LABEL: Record<PersonalFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí/No',
};

// Nombres, apellidos, cédula y (para Personal Administrativo) puesto nunca
// son PersonalFieldDefinition — vienen del nombre de la carpeta de Drive del
// empleado (ver parseEmployeeFolderName/parsePersonalAdminFolderName) y no
// son editables desde ningún lado de la app. Se listan igual acá, fijos y
// sin acciones, para que quede claro que existen y por qué no aparecen como
// campo configurable.
const CAMPOS_FIJOS: Record<PersonalFieldScope, string[]> = {
  GUARDIA: ['Nombres', 'Apellidos', 'Cédula'],
  PERSONAL_ADMIN: ['Nombres', 'Apellidos', 'Cédula', 'Puesto'],
};

const CATEGORY_LABEL: Record<PersonalFieldCategory, string> = {
  PERSONAL: 'Datos personales',
  LABORAL: 'Datos laborales',
};

/**
 * Cualquier usuario con acceso al módulo puede crear aquí un campo nuevo
 * (ej. "Altura") para la Ficha Personal, sin pedir un cambio de código.
 * `scope` distingue si los campos son de Guardias (GuardiaFichaModal) o de
 * Personal Administrativo — cada grupo gestiona los suyos por separado.
 */
interface Props {
  scope?: PersonalFieldScope;
  onClose: () => void;
  onChanged: () => void;
  /** Limita la lista y el selector "Se muestra en" a una sola categoría — usado cuando este componente se embebe como una pestaña de AdministrativeStaffConfigModal. */
  onlyCategory?: PersonalFieldCategory;
  /** true cuando se embebe dentro de otro modal (ej. una pestaña): renderiza solo el contenido, sin overlay/header/footer propios. */
  embedded?: boolean;
}

export default function PersonalFieldsConfigModal({ scope = 'GUARDIA', onClose, onChanged, onlyCategory, embedded }: Props) {
  const [fields, setFields] = useState<PersonalFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<PersonalFieldType>('TEXT');
  const [newCategory, setNewCategory] = useState<PersonalFieldCategory>(onlyCategory || 'PERSONAL');
  const [newRequired, setNewRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const [confirmandoDelete, setConfirmandoDelete] = useState<PersonalFieldDefinition | null>(null);

  const load = () => {
    setLoading(true);
    getPersonalFieldDefinitions(scope)
      .then(setFields)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar los campos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [scope]);

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!newLabel.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createPersonalFieldDefinition({ label: newLabel.trim(), type: newType, scope, category: newCategory, required: newRequired });
      setNewLabel('');
      setNewType('TEXT');
      setNewCategory(onlyCategory || 'PERSONAL');
      setNewRequired(false);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el campo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRequired = async (field: PersonalFieldDefinition) => {
    setError('');
    try {
      await updatePersonalFieldDefinition(field.id, { required: !field.required });
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar el campo.');
    }
  };

  const handleSaveLabel = async (id: number) => {
    if (!editingLabel.trim()) return;
    try {
      await updatePersonalFieldDefinition(id, { label: editingLabel.trim() });
      setEditingId(null);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo renombrar el campo.');
    }
  };

  const handleDelete = (field: PersonalFieldDefinition) => {
    setError('');
    setConfirmandoDelete(field);
  };

  const confirmarDelete = async () => {
    const field = confirmandoDelete;
    if (!field) return;
    setConfirmandoDelete(null);
    try {
      await deletePersonalFieldDefinition(field.id);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar el campo.');
    }
  };

  const body = (
    <>
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#718096' }}>
            Los campos que agregues aquí aparecen en la Ficha Personal de {scope === 'PERSONAL_ADMIN' ? 'todo el personal administrativo' : 'todos los guardias'} de la empresa.
          </p>

          {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

          {!onlyCategory || onlyCategory === 'PERSONAL' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Campos fijos (no editables)</p>
              {CAMPOS_FIJOS[scope].map((label) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc' }}>
                  <span style={{ flex: 1, fontWeight: 600, color: '#64748b' }}>{label}</span>
                  <span className="status-badge" style={{ background: '#eef2f7', color: '#94a3b8', fontSize: '0.7rem' }}>Fijo</span>
                </div>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div className="loading-state">Cargando campos...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '18px' }}>
              {fields.filter((f) => !onlyCategory || f.category === onlyCategory).length === 0 && (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>No hay campos personalizados todavía.</p>
              )}
              {(onlyCategory ? [onlyCategory] : (['PERSONAL', 'LABORAL'] as PersonalFieldCategory[])).map((cat) => {
                const catFields = fields.filter((f) => f.category === cat);
                if (catFields.length === 0) return null;
                return (
                  <div key={cat}>
                    {!onlyCategory && <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{CATEGORY_LABEL[cat]}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {catFields.map((f) => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                          {editingId === f.id ? (
                            <input
                              type="text"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              style={{ flex: 1 }}
                              autoFocus
                            />
                          ) : (
                            <span style={{ flex: 1, fontWeight: 600, color: 'var(--azul-oscuro)' }}>{f.label}</span>
                          )}
                          <span className="status-badge" style={{ background: '#eef2f7', color: '#475569', fontSize: '0.7rem' }}>
                            {TYPE_LABEL[f.type]}
                          </span>
                          <label
                            title="Si está marcado, el label de este campo se muestra con un asterisco rojo en la Ficha Personal y cuenta en la insignia de campos requeridos sin completar — nunca bloquea guardar."
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.72rem', color: '#718096', whiteSpace: 'nowrap' }}
                          >
                            <input
                              type="checkbox"
                              checked={!!f.required}
                              onChange={() => handleToggleRequired(f)}
                              style={{ width: '14px', height: '14px' }}
                            />
                            Requerido
                          </label>
                          {editingId === f.id ? (
                            <button onClick={() => handleSaveLabel(f.id)} style={{ background: 'none', border: 'none', color: '#276749', cursor: 'pointer', display: 'flex' }} title="Guardar">
                              <Check size={15} />
                            </button>
                          ) : (
                            <button onClick={() => { setEditingId(f.id); setEditingLabel(f.label); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex' }} title="Renombrar">
                              <Pencil size={14} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(f)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }} title="Quitar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
              <label>Nombre del campo</label>
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej: Altura" />
            </div>
            <div className="form-group" style={{ flex: '0 0 140px', margin: 0 }}>
              <label>Tipo</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value as PersonalFieldType)}>
                <option value="TEXT">Texto</option>
                <option value="NUMBER">Número</option>
                <option value="DATE">Fecha</option>
                <option value="BOOLEAN">Sí/No</option>
              </select>
            </div>
            {!onlyCategory && (
              <div className="form-group" style={{ flex: '0 0 160px', margin: 0 }}>
                <label>Se muestra en</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as PersonalFieldCategory)}>
                  <option value="PERSONAL">Datos personales</option>
                  <option value="LABORAL">Datos laborales</option>
                </select>
              </div>
            )}
            <div className="form-group" style={{ flex: '0 0 auto', margin: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                Requerido
              </label>
            </div>
            <button type="submit" className="auth-btn" disabled={saving || !newLabel.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={15} /> {saving ? 'Agregando...' : 'Agregar campo'}
            </button>
          </form>
    </>
  );

  const deleteDialog = confirmandoDelete && (
    <ConfirmDialog
      title="Quitar campo"
      message={`¿Quitar el campo "${confirmandoDelete.label}"? Ya no se mostrará en la Ficha Personal (los valores ya guardados no se borran).`}
      confirmLabel="Sí, quitar"
      danger
      onConfirm={confirmarDelete}
      onCancel={() => setConfirmandoDelete(null)}
    />
  );

  if (embedded) {
    return (
      <>
        {body}
        {deleteDialog}
      </>
    );
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={17} /> Configurar campos
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {body}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
    {deleteDialog}
    </>
  );
}
