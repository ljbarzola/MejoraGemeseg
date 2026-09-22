import { useState } from 'react';
import { X, Settings2 } from 'lucide-react';
import {
  addSalesClientField,
  deleteSalesClientField,
  SalesClientField,
} from '../../services/ventas.service';

const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Texto',
  EMAIL: 'Email',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí/No',
};

interface Props {
  fields: SalesClientField[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ClienteFieldsConfigModal({ fields, onClose, onChanged }: Props) {
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [addingField, setAddingField] = useState(false);
  const [error, setError] = useState('');

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    setError('');
    try {
      await addSalesClientField({ label: newFieldLabel.trim(), fieldType: newFieldType });
      setNewFieldLabel('');
      setNewFieldType('TEXT');
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo añadir el campo');
    } finally {
      setAddingField(false);
    }
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
            Estos campos se pueden mapear a las variables de un contrato. Nombre y email son fijos; puedes añadir más.
          </p>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {fields.map((f) => (
              <span key={f.id} style={{ padding: '4px 10px', borderRadius: 12, background: f.isCore ? '#ede9fe' : '#f1f5f9', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {f.label}
                <span style={{ fontSize: 10, color: '#888' }}>({TYPE_LABEL[f.fieldType] || f.fieldType})</span>
                {!f.isCore && (
                  <button type="button" onClick={() => handleDeleteField(f.id)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c33', fontSize: 12, padding: 0 }}>✕</button>
                )}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Nuevo campo (ej. Representante legal)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddField(); } }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }} />
            <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}>
              <option value="TEXT">Texto</option>
              <option value="NUMBER">Número</option>
              <option value="DATE">Fecha</option>
              <option value="BOOLEAN">Sí/No</option>
            </select>
            <button className="btn-secondary" onClick={handleAddField} disabled={addingField || !newFieldLabel.trim()}
              style={{ padding: '8px 14px', fontSize: 12 }}>Añadir campo</button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
