import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Star } from 'lucide-react';
import {
  getComplaintStages,
  createComplaintStage,
  updateComplaintStage,
  deleteComplaintStage,
  type ComplaintStage,
} from '../../services/personal.service';
import ConfirmDialog from '../common/ConfirmDialog';

interface Props {
  onClose: () => void;
  // El tablero (ComplaintsManagementPage) necesita recargar sus columnas
  // cuando las etapas cambian — no comparte estado con este modal.
  onChanged: () => void;
}

// Convierte un label libre en un key estable ("En revisión legal" ->
// "EN_REVISION_LEGAL") — mismo criterio de slug que PersonalFieldDefinition.key,
// pero acá el key se manda explícito al backend (no se autogenera del lado
// del servidor) porque el usuario puede querer editarlo antes de guardar.
const slugifyKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(?=[0-9])/, 'E_');

// RRHH agrega/renombra/reordena/borra las etapas del proceso de "Quejas y
// Sugerencias" (ver ComplaintStage en el backend) — reemplaza el antiguo
// enum fijo de 5 etapas de la Fase 5. Mismo estilo de modal que
// ComplaintFieldsConfigModal.tsx.
export default function ComplaintStagesConfigModal({ onClose, onChanged }: Props) {
  const [stages, setStages] = useState<ComplaintStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#4a5568');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmandoDelete, setConfirmandoDelete] = useState<ComplaintStage | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    getComplaintStages().then(setStages).finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const notifyChanged = () => {
    load();
    onChanged();
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    const key = slugifyKey(newLabel);
    if (!key) return;
    setSaving(true);
    setError('');
    try {
      await createComplaintStage({ key, label: newLabel.trim(), color: newColor, order: stages.length });
      setNewLabel('');
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear la etapa.');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (stage: ComplaintStage, label: string) => {
    if (!label.trim() || label === stage.label) return;
    setError('');
    try {
      await updateComplaintStage(stage.id, { label: label.trim() });
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo renombrar la etapa.');
    }
  };

  const handleColorChange = async (stage: ComplaintStage, color: string) => {
    setError('');
    try {
      await updateComplaintStage(stage.id, { color });
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar el color.');
    }
  };

  const handleSetInitial = async (stage: ComplaintStage) => {
    setError('');
    try {
      await updateComplaintStage(stage.id, { isInitial: true });
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo marcar como inicial.');
    }
  };

  const handleToggleFinal = async (stage: ComplaintStage) => {
    setError('');
    try {
      await updateComplaintStage(stage.id, { isFinal: !stage.isFinal });
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar la etapa.');
    }
  };

  const handleMove = async (stage: ComplaintStage, direction: -1 | 1) => {
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    setError('');
    try {
      await Promise.all([
        updateComplaintStage(stage.id, { order: swapWith.order }),
        updateComplaintStage(swapWith.id, { order: stage.order }),
      ]);
      notifyChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo reordenar.');
    }
  };

  const handleDelete = (stage: ComplaintStage) => {
    setError('');
    setConfirmandoDelete(stage);
  };

  const confirmarDelete = async () => {
    const stage = confirmandoDelete;
    if (!stage) return;
    setConfirmandoDelete(null);
    try {
      await deleteComplaintStage(stage.id);
      notifyChanged();
    } catch (err: any) {
      // El backend responde con la lista concreta de quejas que bloquean el
      // borrado (o el aviso de que es la etapa inicial) en `message` — se
      // muestra tal cual en un ConfirmDialog informativo, nunca con un
      // window.alert nativo.
      setBlockedMessage(err.response?.data?.message || 'No se pudo eliminar la etapa.');
    }
  };

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Etapas del proceso de quejas y sugerencias</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '14px' }}>
            Estas son las columnas del tablero de gestión. La etapa marcada con la estrella es la etapa inicial: toda queja nueva se crea ahí.
          </p>

          {error && <div className="form-error" ref={errorRef} style={{ marginBottom: '14px' }}>{error}</div>}

          {loading ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <>
              {sortedStages.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#a0aec0', marginBottom: '16px' }}>Sin etapas configuradas.</p>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  {sortedStages.map((stage, idx) => (
                    <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="color"
                        value={stage.color}
                        onChange={(e) => handleColorChange(stage, e.target.value)}
                        style={{ width: '28px', height: '28px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                        title="Color de la columna"
                      />
                      <input
                        type="text"
                        defaultValue={stage.label}
                        onBlur={(e) => handleRename(stage, e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', border: '2px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                      />
                      <button
                        onClick={() => handleSetInitial(stage)}
                        title={stage.isInitial ? 'Etapa inicial' : 'Marcar como inicial'}
                        style={{ background: 'none', border: 'none', cursor: stage.isInitial ? 'default' : 'pointer', color: stage.isInitial ? '#d69e2e' : '#cbd5e0' }}
                      >
                        <Star size={16} fill={stage.isInitial ? '#d69e2e' : 'none'} />
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color: '#718096', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={stage.isFinal} onChange={() => handleToggleFinal(stage)} /> Final
                      </label>
                      <button onClick={() => handleMove(stage, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#e2e8f0' : '#a0aec0' }}>
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => handleMove(stage, 1)} disabled={idx === sortedStages.length - 1} style={{ background: 'none', border: 'none', cursor: idx === sortedStages.length - 1 ? 'default' : 'pointer', color: idx === sortedStages.length - 1 ? '#e2e8f0' : '#a0aec0' }}>
                        <ArrowDown size={14} />
                      </button>
                      <button onClick={() => handleDelete(stage)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>Agregar etapa nueva</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    style={{ width: '28px', height: '28px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Nombre de la etapa (ej. En revisión legal)"
                    style={{ flex: '1 1 220px', padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                  />
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
        title="Eliminar etapa"
        message={
          stages.length === 1
            ? `¿Eliminar la etapa "${confirmandoDelete.label}"? Si es la única, también se borran las quejas que estén en ella. Esta acción no se puede deshacer.`
            : `¿Eliminar la etapa "${confirmandoDelete.label}"? Esta acción no se puede deshacer.`
        }
        confirmLabel="Sí, eliminar"
        danger
        onConfirm={confirmarDelete}
        onCancel={() => setConfirmandoDelete(null)}
      />
    )}
    {blockedMessage && (
      <ConfirmDialog
        title="No se puede eliminar la etapa"
        message={
          <span>
            {blockedMessage.split(/;\s*/).map((chunk, i) => (
              <span key={i} style={{ display: 'block', marginTop: i === 0 ? 0 : '4px' }}>{chunk}</span>
            ))}
          </span>
        }
        confirmLabel="Entendido"
        cancelLabel="Entendido"
        onConfirm={() => setBlockedMessage(null)}
        onCancel={() => setBlockedMessage(null)}
      />
    )}
    </>
  );
}
