import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  getComplaintFields,
  createComplaintField,
  updateComplaintField,
  deleteComplaintField,
  type ComplaintFieldDefinition,
} from '../../services/personal.service';
import ConfirmDialog from '../common/ConfirmDialog';

const TYPE_LABELS: Record<string, string> = { TEXT: 'Texto', NUMBER: 'Número', DATE: 'Fecha' };

interface Props {
  onClose: () => void;
}

// RRHH agrega/quita campos extra al formulario público de "Enviar una
// queja" (ComplaintsPage.tsx) — descripción y anónimo son siempre fijos,
// esto es solo lo adicional (ej. Departamento, Cargo).
export default function ComplaintFieldsConfigModal({ onClose }: Props) {
  const [fields, setFields] = useState<ComplaintFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'TEXT' | 'NUMBER' | 'DATE'>('TEXT');
  const [newRequired, setNewRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmandoDelete, setConfirmandoDelete] = useState<ComplaintFieldDefinition | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    getComplaintFields().then(setFields).finally(() => setLoading(false));
  };

  useEffect(load, []);

  // El banner de error puede quedar fuera de vista si la lista de campos es
  // larga; se hace scrollIntoView cada vez que aparece un error nuevo.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createComplaintField({ label: newLabel.trim(), type: newType, required: newRequired });
      setNewLabel('');
      setNewRequired(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el campo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRequired = async (f: ComplaintFieldDefinition) => {
    setError('');
    try {
      await updateComplaintField(f.id, { required: !f.required });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar.');
    }
  };

  const handleDelete = (f: ComplaintFieldDefinition) => {
    setError('');
    setConfirmandoDelete(f);
  };

  const confirmarDelete = async () => {
    const f = confirmandoDelete;
    if (!f) return;
    setConfirmandoDelete(null);
    try {
      await deleteComplaintField(f.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar.');
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Campos del formulario de quejas y sugerencias</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '14px' }}>
            La descripción y la opción de anónimo siempre están presentes. Aquí puedes agregar campos extra (ej. Departamento, Cargo) y marcar cuáles son obligatorios.
          </p>

          {error && <div className="form-error" ref={errorRef} style={{ marginBottom: '14px' }}>{error}</div>}

          {loading ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <>
              {fields.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#a0aec0', marginBottom: '16px' }}>Sin campos extra configurados.</p>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  {fields.map((f) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{f.label}</span>
                        <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: '#a0aec0' }}>({TYPE_LABELS[f.type]})</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={f.required} onChange={() => handleToggleRequired(f)} /> Obligatorio
                      </label>
                      <button onClick={() => handleDelete(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>Agregar campo nuevo</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Nombre del campo (ej. Departamento)"
                    style={{ flex: '1 1 200px', padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                  />
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'TEXT' | 'NUMBER' | 'DATE')}
                    style={{ padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                  >
                    <option value="TEXT">Texto</option>
                    <option value="NUMBER">Número</option>
                    <option value="DATE">Fecha</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} /> Obligatorio
                  </label>
                  <button className="btn-secondary" onClick={handleAdd} disabled={saving || !newLabel.trim()} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
    {confirmandoDelete && (
      <ConfirmDialog
        title="Quitar campo"
        message={`¿Quitar el campo "${confirmandoDelete.label}" del formulario?`}
        confirmLabel="Sí, quitar"
        danger
        onConfirm={confirmarDelete}
        onCancel={() => setConfirmandoDelete(null)}
      />
    )}
    </>
  );
}
