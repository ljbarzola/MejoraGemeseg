import { useState } from 'react';
import { X, Settings2, Plus, Trash2 } from 'lucide-react';
import {
  addSalesClientField,
  updateSalesClientField,
  deleteSalesClientField,
  SalesClientField,
  SalesClientFieldOption,
} from '../../services/ventas.service';

const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Texto',
  EMAIL: 'Email',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí/No',
  SELECT: 'Lista de opciones',
};

// Convierte un label libre en un key estable — mismo criterio que
// ComplaintStagesConfigModal.tsx / SalesClientStagesConfigModal.tsx.
const slugifyKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

interface Props {
  fields: SalesClientField[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ClienteFieldsConfigModal({ fields, onClose, onChanged }: Props) {
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [newOptions, setNewOptions] = useState<SalesClientFieldOption[]>([]);
  const [newAllowOther, setNewAllowOther] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    setError('');
    try {
      await addSalesClientField({
        label: newFieldLabel.trim(),
        fieldType: newFieldType,
        options: newFieldType === 'SELECT' ? newOptions : undefined,
        allowOther: newFieldType === 'SELECT' ? newAllowOther : undefined,
      });
      setNewFieldLabel('');
      setNewFieldType('TEXT');
      setNewOptions([]);
      setNewAllowOther(false);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo añadir el campo');
    } finally {
      setAddingField(false);
    }
  };

  const handleAddNewOption = () => {
    if (!newOptionLabel.trim()) return;
    const key = slugifyKey(newOptionLabel);
    if (!key || newOptions.some((o) => o.key === key)) return;
    setNewOptions([...newOptions, { key, label: newOptionLabel.trim() }]);
    setNewOptionLabel('');
  };

  const handleDeleteField = async (id: number) => {
    setError('');
    try {
      await deleteSalesClientField(id);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo quitar el campo');
    }
  };

  const handleRenameField = async (field: SalesClientField, label: string) => {
    if (!label.trim() || label === field.label) return;
    setError('');
    try {
      await updateSalesClientField(field.id, { label: label.trim() });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo renombrar el campo');
    }
  };

  const handleAddOptionToField = async (field: SalesClientField, label: string) => {
    if (!label.trim()) return;
    const key = slugifyKey(label);
    if (!key || field.options?.some((o) => o.key === key)) return;
    setError('');
    try {
      await updateSalesClientField(field.id, { options: [...(field.options || []), { key, label: label.trim() }] });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo agregar la opción');
    }
  };

  const handleRenameOption = async (field: SalesClientField, optionKey: string, label: string) => {
    if (!label.trim()) return;
    setError('');
    try {
      const options = (field.options || []).map((o) => (o.key === optionKey ? { ...o, label: label.trim() } : o));
      await updateSalesClientField(field.id, { options });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo renombrar la opción');
    }
  };

  const handleToggleAllowOther = async (field: SalesClientField) => {
    setError('');
    try {
      await updateSalesClientField(field.id, { allowOther: !field.allowOther });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo actualizar el campo');
    }
  };

  const handleRemoveOption = async (field: SalesClientField, optionKey: string) => {
    setError('');
    try {
      const options = (field.options || []).filter((o) => o.key !== optionKey);
      await updateSalesClientField(field.id, { options });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo quitar la opción');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={17} /> Configurar campos de la ficha
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
            Estos campos se pueden mapear a las variables de un contrato. Nombre y email son fijos; puedes añadir más,
            y renombrar o editar las opciones de "Fuente" y "Servicio requerido".
          </p>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {fields.map((f) => (
              <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    defaultValue={f.label}
                    onBlur={(e) => handleRenameField(f, e.target.value)}
                    style={{ flex: 1, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, fontWeight: 600 }}
                  />
                  <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>({TYPE_LABEL[f.fieldType] || f.fieldType})</span>
                  {f.fieldType === 'SELECT' && (
                    <button type="button" onClick={() => setEditingId(editingId === f.id ? null : f.id)}
                      className="btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}>
                      {editingId === f.id ? 'Cerrar' : 'Opciones'}
                    </button>
                  )}
                  {!f.isCore && (
                    <button type="button" onClick={() => handleDeleteField(f.id)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c33' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {f.fieldType === 'SELECT' && editingId === f.id && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                    {(f.options || []).map((o) => (
                      <div key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <input
                          defaultValue={o.label}
                          onBlur={(e) => handleRenameOption(f, o.key, e.target.value)}
                          style={{ flex: 1, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}
                        />
                        <button type="button" onClick={() => handleRemoveOption(f, o.key)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c33' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <AddOptionRow onAdd={(label) => handleAddOptionToField(f, label)} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#666', marginTop: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={f.allowOther} onChange={() => handleToggleAllowOther(f)} />
                      Permitir "Otro" con texto libre
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>Agregar campo nuevo</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Nuevo campo (ej. Representante legal)"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddField(); } }}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }} />
              <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}>
                <option value="TEXT">Texto</option>
                <option value="NUMBER">Número</option>
                <option value="DATE">Fecha</option>
                <option value="BOOLEAN">Sí/No</option>
                <option value="SELECT">Lista de opciones</option>
              </select>
              <button className="btn-secondary" onClick={handleAddField} disabled={addingField || !newFieldLabel.trim()}
                style={{ padding: '8px 14px', fontSize: 12 }}>Añadir campo</button>
            </div>

            {newFieldType === 'SELECT' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {newOptions.map((o) => (
                    <span key={o.key} style={{ padding: '3px 8px', borderRadius: 10, background: '#f1f5f9', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {o.label}
                      <button type="button" onClick={() => setNewOptions(newOptions.filter((x) => x.key !== o.key))}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c33', padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} placeholder="Opción (ej. Referido)"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewOption(); } }}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }} />
                  <button type="button" className="btn-secondary" onClick={handleAddNewOption} style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Opción
                  </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#666', marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newAllowOther} onChange={(e) => setNewAllowOther(e.target.checked)} />
                  Permitir "Otro" con texto libre
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function AddOptionRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [label, setLabel] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nueva opción"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(label); setLabel(''); } }}
        style={{ flex: 1, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
      <button type="button" className="btn-secondary" onClick={() => { onAdd(label); setLabel(''); }} style={{ padding: '4px 8px', fontSize: 11 }}>
        <Plus size={12} />
      </button>
    </div>
  );
}
