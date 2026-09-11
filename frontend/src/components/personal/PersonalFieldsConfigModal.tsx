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

const TYPE_LABEL: Record<PersonalFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
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
export default function PersonalFieldsConfigModal({ scope = 'GUARDIA', onClose, onChanged }: { scope?: PersonalFieldScope; onClose: () => void; onChanged: () => void }) {
  const [fields, setFields] = useState<PersonalFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<PersonalFieldType>('TEXT');
  const [newCategory, setNewCategory] = useState<PersonalFieldCategory>('PERSONAL');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

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
      await createPersonalFieldDefinition({ label: newLabel.trim(), type: newType, scope, category: newCategory });
      setNewLabel('');
      setNewType('TEXT');
      setNewCategory('PERSONAL');
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el campo.');
    } finally {
      setSaving(false);
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

  const handleDelete = async (field: PersonalFieldDefinition) => {
    if (!confirm(`¿Quitar el campo "${field.label}"? Ya no se mostrará en la Ficha Personal (los valores ya guardados no se borran).`)) return;
    try {
      await deletePersonalFieldDefinition(field.id);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar el campo.');
    }
  };

  return (
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
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#718096' }}>
            Los campos que agregues aquí aparecen en la Ficha Personal de {scope === 'PERSONAL_ADMIN' ? 'todo el personal administrativo' : 'todos los guardias'} de la empresa.
          </p>

          {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

          {loading ? (
            <div className="loading-state">Cargando campos...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '18px' }}>
              {fields.length === 0 && (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>No hay campos personalizados todavía.</p>
              )}
              {(['PERSONAL', 'LABORAL'] as PersonalFieldCategory[]).map((cat) => {
                const catFields = fields.filter((f) => f.category === cat);
                if (catFields.length === 0) return null;
                return (
                  <div key={cat}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{CATEGORY_LABEL[cat]}</p>
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
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 160px', margin: 0 }}>
              <label>Se muestra en</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as PersonalFieldCategory)}>
                <option value="PERSONAL">Datos personales</option>
                <option value="LABORAL">Datos laborales</option>
              </select>
            </div>
            <button type="submit" className="auth-btn" disabled={saving || !newLabel.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={15} /> {saving ? 'Agregando...' : 'Agregar campo'}
            </button>
          </form>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
