import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, FileCog } from 'lucide-react';
import { getDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType } from '../../services/personal.service';
import ConfirmDialog from '../common/ConfirmDialog';

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
interface Props {
  onClose: () => void;
  /** true cuando se embebe dentro de otro modal (ej. una pestaña): renderiza solo el contenido, sin overlay/header/footer propios. */
  embedded?: boolean;
}

export default function DocumentosRequeridosModal({ onClose, embedded }: Props) {
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const [confirmandoDelete, setConfirmandoDelete] = useState<DocumentType | null>(null);
  // Mismo patrón que PersonalFieldsConfigModal: nombre y "requerido" se
  // editan juntos y se confirman con un botón Guardar explícito, en vez de
  // guardarse solos al tocarlos.
  const [editingRequired, setEditingRequired] = useState(false);
  const [confirmandoGuardar, setConfirmandoGuardar] = useState<DocumentType | null>(null);
  const [guardando, setGuardando] = useState(false);

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

  const abrirEdicion = (dt: DocumentType) => {
    setError('');
    setEditingId(dt.id);
    setEditingName(dt.name);
    setEditingRequired(dt.required);
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setError('');
  };

  const pedirConfirmacion = (dt: DocumentType) => {
    if (!editingName.trim()) {
      setError('El nombre del documento no puede quedar vacío.');
      return;
    }
    const sinCambios = editingName.trim() === dt.name && editingRequired === dt.required;
    if (sinCambios) {
      setEditingId(null);
      return;
    }
    setConfirmandoGuardar(dt);
  };

  const guardarCambios = async () => {
    const dt = confirmandoGuardar;
    if (!dt) return;
    setGuardando(true);
    setError('');
    try {
      await updateDocumentType(dt.id, { name: editingName.trim(), required: editingRequired });
      setConfirmandoGuardar(null);
      setEditingId(null);
      load();
    } catch (err: any) {
      setConfirmandoGuardar(null);
      setError(err.response?.data?.message || 'No se pudo guardar el documento.');
    } finally {
      setGuardando(false);
    }
  };

  const handleDelete = (dt: DocumentType) => {
    setError('');
    setConfirmandoDelete(dt);
  };

  const confirmarDelete = async () => {
    const dt = confirmandoDelete;
    if (!dt) return;
    setConfirmandoDelete(null);
    try {
      await deleteDocumentType(dt.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar el documento.');
    }
  };

  const body = (
    <>
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
              {docTypes.map((dt) => {
                const enEdicion = editingId === dt.id;
                return (
                <div
                  key={dt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: enEdicion ? '12px' : '8px 12px',
                    border: `1px solid ${enEdicion ? 'var(--azul-claro)' : '#e2e8f0'}`, borderRadius: '10px',
                    background: enEdicion ? 'rgba(18, 55, 95, 0.04)' : '#fff', flexWrap: 'wrap',
                  }}
                >
                  {enEdicion ? (
                    <>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pedirConfirmacion(dt); } if (e.key === 'Escape') cancelarEdicion(); }}
                        style={{ flex: '1 1 200px', minWidth: 0 }}
                        aria-label="Nombre del documento"
                        autoFocus
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#4a5568', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={editingRequired} onChange={(e) => setEditingRequired(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                        Requerido
                      </label>
                      <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                        <button type="button" className="btn-secondary" onClick={cancelarEdicion} style={{ padding: '7px 12px', fontSize: '0.8rem' }}>
                          Cancelar
                        </button>
                        <button type="button" className="auth-btn" onClick={() => pedirConfirmacion(dt)} style={{ padding: '7px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Check size={14} /> Guardar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: '1 1 180px', fontWeight: 600, color: 'var(--azul-oscuro)', minWidth: 0 }}>{dt.name}</span>
                      {dt.required && (
                        <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030', fontSize: '0.7rem' }}>
                          Requerido
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
                        <button onClick={() => abrirEdicion(dt)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', padding: '4px' }} title="Editar documento">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(dt)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '4px' }} title="Quitar documento">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                );
              })}
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
            <button type="submit" className="auth-btn" disabled={saving || !newName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <Plus size={15} /> {saving ? 'Agregando...' : 'Agregar'}
            </button>
          </form>
    </>
  );

  const guardarDialog = confirmandoGuardar && (
    <ConfirmDialog
      title="Guardar cambios del documento"
      message={(() => {
        const dt = confirmandoGuardar;
        const partes: string[] = [];
        if (editingName.trim() !== dt.name) partes.push(`se renombrará de "${dt.name}" a "${editingName.trim()}"`);
        if (editingRequired !== dt.required) partes.push(editingRequired ? 'pasará a ser obligatorio' : 'dejará de ser obligatorio');
        return `El documento ${partes.join('; ')}. Aplica al checklist de todo el personal administrativo. ¿Deseas guardar?`;
      })()}
      confirmLabel={guardando ? 'Guardando...' : 'Sí, guardar'}
      onConfirm={guardarCambios}
      onCancel={() => setConfirmandoGuardar(null)}
    />
  );

  const deleteDialog = confirmandoDelete && (
    <ConfirmDialog
      title="Quitar documento requerido"
      message={`¿Quitar "${confirmandoDelete.name}" de los documentos requeridos de Personal Administrativo?`}
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
        {guardarDialog}
        {guardarDialog}
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
            <FileCog size={17} /> Documentos requeridos — Personal Administrativo
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
