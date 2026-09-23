import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, CheckCircle2, RotateCcw, Paperclip, Trash2, FolderOpen } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DateInput from '../../components/common/DateInput';
import {
  getTrainings,
  createTraining,
  updateTraining,
  deleteTraining,
  setTrainingCompleted,
  addTrainingAttachment,
  removeTrainingAttachment,
  uploadTrainingFile,
  getDriveConfig,
  TRAINING_TYPES,
  type Training,
  type TrainingAttachment,
} from '../../services/personal.service';
import { usePerm } from '../../contexts/PermissionsContext';
import { buildDriveFolderLink } from '../../utils/driveLink';
import FileOrLinkInput from '../../components/common/FileOrLinkInput';

const DRIVE_FOLDER_TYPE = 'CAPACITACIONES';
const EMPTY_FORM = { name: '', type: 'INDUCCION', customType: '', description: '', dueDate: '', isAnnualPlan: false };

interface StagedAttachment { url: string; name?: string }

function typeLabel(type: string) {
  return TRAINING_TYPES.find((t) => t.value === type)?.label || type;
}

function isPending(t: Training) {
  if (!t.dueDate || t.completed) return false;
  return new Date(t.dueDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

// Lista de adjuntos reutilizada tanto para "staged" (sin id de capacitación
// todavía, ej. al crear) como para persistidos de inmediato (al editar) —
// el padre decide qué hace onAdd/onRemove en cada caso.
function AttachmentSection({
  title, items, onAdd, onRemove, canEdit, uploadFn,
}: {
  title: string;
  items: { key: string | number; url: string; name?: string | null }[];
  onAdd: (url: string, name?: string) => void;
  onRemove: (key: string | number) => void;
  canEdit: boolean;
  uploadFn: (file: File) => Promise<{ url: string }>;
}) {
  const [pendingUrl, setPendingUrl] = useState('');

  return (
    <div style={{ marginBottom: '16px' }}>
      <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Sin adjuntos todavía.</p>
      ) : (
        items.map((a) => (
          <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', flex: 1 }}>{a.name || a.url}</a>
            {canEdit && (
              <button type="button" onClick={() => onRemove(a.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <FileOrLinkInput value={pendingUrl} onChange={setPendingUrl} uploadFn={uploadFn} accept="image/*,.pdf,.doc,.docx" />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { if (pendingUrl.trim()) { onAdd(pendingUrl.trim()); setPendingUrl(''); } }}
            disabled={!pendingUrl.trim()}
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

export default function TrainingsPage() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [driveConfig, setDriveConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const subirArchivoCapacitacion = async (file: File) => {
    if (!driveConfig) {
      throw {
        response: {
          data: {
            message: 'Subir un archivo necesita la carpeta de Drive de Capacitaciones. Mientras tanto puedes pegar un enlace.',
          },
        },
      };
    }
    return uploadTrainingFile(file);
  };

  const [showModal, setShowModal] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stagedDocs, setStagedDocs] = useState<StagedAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  const [completingTraining, setCompletingTraining] = useState<Training | null>(null);
  const [completing, setCompleting] = useState(false);

  // Errores de guardado/adjuntos dentro del modal de crear/editar y del modal
  // de registrar cumplimiento.
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (saveError) saveErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [saveError]);

  const [attachmentError, setAttachmentError] = useState('');
  const attachmentErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (attachmentError) attachmentErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attachmentError]);

  const [completeError, setCompleteError] = useState('');
  const completeErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (completeError) completeErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [completeError]);

  // Eliminar capacitación (acción de la tabla, fuera de cualquier modal).
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Training | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (deleteError) deleteErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deleteError]);

  // Revertir cumplimiento a pendiente (acción de la tabla, fuera de cualquier modal).
  const [confirmandoRevertir, setConfirmandoRevertir] = useState<Training | null>(null);
  const [revertError, setRevertError] = useState('');
  const revertErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revertError) revertErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [revertError]);

  const load = () => {
    setLoading(true);
    getTrainings()
      .then(setTrainings)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar las capacitaciones.'))
      .finally(() => setLoading(false));
  };

  const loadConfig = () => {
    setLoadingConfig(true);
    getDriveConfig(DRIVE_FOLDER_TYPE)
      .then(setDriveConfig)
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  };

  useEffect(() => { load(); loadConfig(); }, []);

  const driveFolderUrl = driveConfig?.driveFolderId
    ? (driveConfig.driveFolderLink || buildDriveFolderLink(driveConfig.driveFolderId))
    : '';

  const openCreate = () => {
    setEditingTraining(null);
    setForm(EMPTY_FORM);
    setStagedDocs([]);
    setSaveError('');
    setAttachmentError('');
    setShowModal(true);
  };

  const openEdit = (t: Training) => {
    setEditingTraining(t);
    const knownType = TRAINING_TYPES.some((tt) => tt.value === t.type);
    setForm({
      name: t.name,
      type: knownType ? t.type : 'OTRO',
      customType: knownType ? '' : t.type,
      description: t.description || '',
      dueDate: t.dueDate ? t.dueDate.split('T')[0] : '',
      isAnnualPlan: t.isAnnualPlan,
    });
    setStagedDocs([]);
    setSaveError('');
    setAttachmentError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (form.type === 'OTRO' && !form.customType.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name,
        type: form.type === 'OTRO' ? form.customType.trim() : form.type,
        description: form.description,
        dueDate: form.dueDate || undefined,
        isAnnualPlan: form.isAnnualPlan,
      };
      if (editingTraining) {
        await updateTraining(editingTraining.id, payload);
      } else {
        const created = await createTraining(payload);
        for (const doc of stagedDocs) {
          await addTrainingAttachment(created.id, { url: doc.url, name: doc.name, kind: 'DOCUMENTO' });
        }
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (t: Training) => {
    setDeleteError('');
    setConfirmandoEliminar(t);
  };

  const confirmarEliminar = async () => {
    const t = confirmandoEliminar;
    if (!t) return;
    setConfirmandoEliminar(null);
    try {
      await deleteTraining(t.id);
      load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'No se pudo eliminar.');
    }
  };

  // Persistencia inmediata de adjuntos de una capacitación ya existente
  // (editar), llamando a la API en el momento en vez de esperar a "Guardar".
  const handleAddLiveAttachment = async (trainingId: number, kind: 'DOCUMENTO' | 'EVIDENCIA', url: string) => {
    setAttachmentError('');
    try {
      await addTrainingAttachment(trainingId, { url, kind });
      const fresh = await getTrainings();
      setTrainings(fresh);
      if (editingTraining) setEditingTraining(fresh.find((t) => t.id === editingTraining.id) || null);
      if (completingTraining) setCompletingTraining(fresh.find((t) => t.id === completingTraining.id) || null);
    } catch (err: any) {
      setAttachmentError(err.response?.data?.message || 'No se pudo agregar el adjunto.');
    }
  };

  const handleRemoveLiveAttachment = async (trainingId: number, attachmentId: number) => {
    setAttachmentError('');
    try {
      await removeTrainingAttachment(trainingId, attachmentId);
      const fresh = await getTrainings();
      setTrainings(fresh);
      if (editingTraining) setEditingTraining(fresh.find((t) => t.id === editingTraining.id) || null);
    } catch (err: any) {
      setAttachmentError(err.response?.data?.message || 'No se pudo quitar el adjunto.');
    }
  };

  const openCompleteFlow = (t: Training) => {
    setAttachmentError('');
    setCompleteError('');
    setCompletingTraining(t);
  };

  const handleConfirmCompleted = async () => {
    if (!completingTraining) return;
    setCompleting(true);
    setCompleteError('');
    try {
      await setTrainingCompleted(completingTraining.id, true);
      setCompletingTraining(null);
      load();
    } catch (err: any) {
      setCompleteError(err.response?.data?.message || 'No se pudo registrar el cumplimiento.');
    } finally {
      setCompleting(false);
    }
  };

  const handleRevertCompleted = (t: Training) => {
    setRevertError('');
    setConfirmandoRevertir(t);
  };

  const confirmarRevertir = async () => {
    const t = confirmandoRevertir;
    if (!t) return;
    setConfirmandoRevertir(null);
    try {
      await setTrainingCompleted(t.id, false);
      load();
    } catch (err: any) {
      setRevertError(err.response?.data?.message || 'No se pudo actualizar.');
    }
  };

  if (loading || loadingConfig) return <div className="loading-state">Cargando capacitaciones...</div>;

  const editDocs = (editingTraining?.attachments || []).filter((a) => a.kind === 'DOCUMENTO');
  const editEvidencia = (editingTraining?.attachments || []).filter((a) => a.kind === 'EVIDENCIA');

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Capacitaciones</h1>
          </div>
          <div className="header-actions">
            {canEdit && (
              <button className="auth-btn" onClick={openCreate}>
                <Plus size={16} /> Nueva capacitación
              </button>
            )}
            {driveFolderUrl && (
              <a
                className="btn-secondary"
                href={driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir la carpeta de capacitaciones en Google Drive"
              >
                <FolderOpen size={16} /> Ver carpeta
              </a>
            )}
          </div>
        </div>
      </div>

      {canEdit && !loadingConfig && !driveConfig && (
        <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', color: '#975a16', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.85rem' }}>
          Puedes registrar la capacitación, las fechas y los enlaces. Subir un archivo sigue bloqueado hasta que Sistemas defina la carpeta de Drive de Capacitaciones.
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '20px' }}>
        El cumplimiento es general (una vez registrado, ya está listo) y puedes adjuntar varios documentos y enlaces, guardados en la carpeta de Drive de Capacitaciones.
      </p>

      {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {deleteError && <div ref={deleteErrorRef} className="form-error" style={{ marginBottom: '16px' }}>{deleteError}</div>}
      {revertError && <div ref={revertErrorRef} className="form-error" style={{ marginBottom: '16px' }}>{revertError}</div>}

      <div className="admin-section">
        {trainings.length === 0 ? (
          <div className="empty-state">No hay capacitaciones registradas todavía.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Capacitación</th>
                  <th>Tipo</th>
                  <th>Fecha límite</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{t.name}</span>
                        {t.attachments.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.72rem', color: '#718096' }}>
                            <Paperclip size={12} /> {t.attachments.length}
                          </span>
                        )}
                      </div>
                      {t.description && <div style={{ fontSize: '0.78rem', color: '#718096' }}>{t.description}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <span className="status-badge" style={{ background: '#ebf8ff', color: '#2b6cb0' }}>{typeLabel(t.type)}</span>
                        <span className="status-badge" style={{ background: t.isAnnualPlan ? '#e9d8fd' : '#edf2f7', color: t.isAnnualPlan ? '#6b46c1' : '#718096' }}>
                          {t.isAnnualPlan ? 'Plan anual' : 'Puntual'}
                        </span>
                      </div>
                    </td>
                    <td>
                      {t.dueDate ? (
                        <span style={{ color: isPending(t) ? '#c53030' : undefined, fontWeight: isPending(t) ? 700 : undefined }}>
                          {new Date(t.dueDate).toLocaleDateString('es-EC')}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: t.completed ? '#c6f6d5' : '#fff5f5', color: t.completed ? '#276749' : '#c53030' }}>
                        {t.completed ? 'Completada' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {t.completed ? (
                          <button className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleRevertCompleted(t)}>
                            <RotateCcw size={14} /> Revertir cumplimiento
                          </button>
                        ) : (
                          <button className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openCompleteFlow(t)}>
                            <CheckCircle2 size={14} /> Registrar cumplimiento
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openEdit(t)}>Editar</button>
                            <button className="btn-secondary" style={{ padding: '6px 10px', color: '#c53030' }} onClick={() => handleDelete(t)}>Eliminar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: CREAR / EDITAR */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTraining ? 'Editar capacitación' : 'Nueva capacitación'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {saveError && <div ref={saveErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{saveError}</div>}
              {attachmentError && <div ref={attachmentErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{attachmentError}</div>}
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tipo *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TRAINING_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {form.type === 'OTRO' && (
                  <input
                    type="text"
                    value={form.customType}
                    onChange={(e) => setForm({ ...form, customType: e.target.value })}
                    placeholder="Escribe el tipo de capacitación"
                    style={{ marginTop: '8px' }}
                  />
                )}
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="form-group">
                <label>Fecha límite</label>
                <DateInput value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={form.isAnnualPlan} onChange={(e) => setForm({ ...form, isAnnualPlan: e.target.checked })} />
                  Forma parte del plan anual
                </label>
              </div>

              <div style={{ paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                {editingTraining ? (
                  <AttachmentSection
                    title="Documentos del plan"
                    items={editDocs.map((a) => ({ key: a.id, url: a.url, name: a.name }))}
                    onAdd={(url) => handleAddLiveAttachment(editingTraining.id, 'DOCUMENTO', url)}
                    onRemove={(key) => handleRemoveLiveAttachment(editingTraining.id, Number(key))}
                    canEdit={canEdit}
                    uploadFn={subirArchivoCapacitacion}
                  />
                ) : (
                  <AttachmentSection
                    title="Documentos del plan"
                    items={stagedDocs.map((d, i) => ({ key: i, url: d.url, name: d.name }))}
                    onAdd={(url) => setStagedDocs((prev) => [...prev, { url }])}
                    onRemove={(key) => setStagedDocs((prev) => prev.filter((_, i) => i !== Number(key)))}
                    canEdit={canEdit}
                    uploadFn={subirArchivoCapacitacion}
                  />
                )}

                {editingTraining && (editingTraining.completed || editEvidencia.length > 0) && (
                  <AttachmentSection
                    title="Evidencia de cumplimiento"
                    items={editEvidencia.map((a) => ({ key: a.id, url: a.url, name: a.name }))}
                    onAdd={(url) => handleAddLiveAttachment(editingTraining.id, 'EVIDENCIA', url)}
                    onRemove={(key) => handleRemoveLiveAttachment(editingTraining.id, Number(key))}
                    canEdit={canEdit}
                    uploadFn={subirArchivoCapacitacion}
                  />
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleSave} disabled={saving || !form.name.trim() || (form.type === 'OTRO' && !form.customType.trim())}>
                {saving ? 'Guardando...' : editingTraining ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR CUMPLIMIENTO (evidencia + confirmar) */}
      {completingTraining && (
        <div className="modal-overlay" onClick={() => setCompletingTraining(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registrar cumplimiento: {completingTraining.name}</h3>
              <button className="modal-close" onClick={() => setCompletingTraining(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {completeError && <div ref={completeErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{completeError}</div>}
              {attachmentError && <div ref={attachmentErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{attachmentError}</div>}
              <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '14px' }}>
                Puedes adjuntar evidencia (foto de asistencia, certificado, lo que sea) antes de confirmar — es opcional.
              </p>
              <AttachmentSection
                title="Evidencia de cumplimiento"
                items={(completingTraining.attachments || []).filter((a) => a.kind === 'EVIDENCIA').map((a: TrainingAttachment) => ({ key: a.id, url: a.url, name: a.name }))}
                onAdd={(url) => handleAddLiveAttachment(completingTraining.id, 'EVIDENCIA', url)}
                onRemove={(key) => handleRemoveLiveAttachment(completingTraining.id, Number(key))}
                canEdit
                uploadFn={subirArchivoCapacitacion}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCompletingTraining(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleConfirmCompleted} disabled={completing} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} /> {completing ? 'Guardando...' : 'Confirmar cumplimiento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar capacitación"
          message={`¿Eliminar la capacitación "${confirmandoEliminar.name}"?`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}

      {confirmandoRevertir && (
        <ConfirmDialog
          title="Revertir cumplimiento"
          message={`¿Marcar "${confirmandoRevertir.name}" nuevamente como pendiente?`}
          confirmLabel="Sí, marcar como pendiente"
          onConfirm={confirmarRevertir}
          onCancel={() => setConfirmandoRevertir(null)}
        />
      )}
    </div>
  );
}
