import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, FileCog } from 'lucide-react';
import { getDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType } from '../../services/personal.service';

interface DocumentType {
  id: number;
  name: string;
  folder: string;
  required: boolean;
}

/**
 * Configuración de documentos obligatorios exclusiva de Personal
 * Administrativo — a diferencia de Guardias/Custodias (que comparten la
 * pantalla /rrhh/document-types con varias carpetas a la vez), aquí no tiene
 * sentido mostrar ni mezclar esas otras carpetas: la documentación de este
 * grupo no tiene relación con la de Guardias. Por eso se gestiona en un modal
 * propio, siempre con folder='PERSONAL_ADMIN' fijo.
 */
export default function DocumentosRequeridosModal({ onClose }: { onClose: () => void }) {
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = () => {
    setLoading(true);
    getDocumentTypes()
      .then((all: DocumentType[]) => setDocTypes(all.filter((d) => d.folder === 'PERSONAL_ADMIN')))
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar los documentos requeridos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createDocumentType({ name: newName.trim(), folder: 'PERSONAL_ADMIN', required: newRequired });
      setNewName('');
      setNewRequired(true);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el documento requerido.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      await updateDocumentType(id, { name: editingName.trim() });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo renombrar el documento.');
    }
  };

  const handleToggleRequired = async (dt: DocumentType) => {
    try {
      await updateDocumentType(dt.id, { required: !dt.required });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar el documento.');
    }
  };

  const handleDelete = async (dt: DocumentType) => {
    if (!confirm(`¿Quitar "${dt.name}" de los documentos requeridos de Personal Administrativo?`)) return;
    try {
      await deleteDocumentType(dt.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar el documento.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCog size={17} /> Documentos requeridos — Personal Administrativo
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#718096' }}>
            Define qué documentos debe tener cada empleado administrativo. Esta lista es propia de este grupo, independiente de la de Guardias/Custodias.
          </p>

          {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

          {loading ? (
            <div className="loading-state">Cargando documentos requeridos...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {docTypes.length === 0 && (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>No hay documentos requeridos todavía.</p>
              )}
              {docTypes.map((dt) => (
                <div key={dt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  {editingId === dt.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ flex: 1, fontWeight: 600, color: 'var(--azul-oscuro)' }}>{dt.name}</span>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#718096', cursor: 'pointer' }}>
                    <input type="checkbox" checked={dt.required} onChange={() => handleToggleRequired(dt)} style={{ width: '14px', height: '14px' }} />
                    Requerido
                  </label>
                  {editingId === dt.id ? (
                    <button onClick={() => handleSaveName(dt.id)} style={{ background: 'none', border: 'none', color: '#276749', cursor: 'pointer', display: 'flex' }} title="Guardar">
                      <Check size={15} />
                    </button>
                  ) : (
                    <button onClick={() => { setEditingId(dt.id); setEditingName(dt.name); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex' }} title="Renombrar">
                      <Pencil size={14} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(dt)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }} title="Quitar">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
              <label>Nombre del documento</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Cédula, Contrato..." />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#475569', cursor: 'pointer', marginBottom: '10px' }}>
              <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Requerido
            </label>
            <button type="submit" className="auth-btn" disabled={saving || !newName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={15} /> {saving ? 'Agregando...' : 'Agregar'}
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
