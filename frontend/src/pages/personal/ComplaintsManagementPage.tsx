import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Settings2, ListOrdered } from 'lucide-react';
import {
  getAllComplaints,
  changeComplaintStage,
  getComplaintFields,
  getComplaintStages,
  type Complaint,
  type ComplaintFieldDefinition,
  type ComplaintStage,
} from '../../services/personal.service';
import { usePerm } from '../../contexts/PermissionsContext';
import ComplaintFieldsConfigModal from '../../components/personal/ComplaintFieldsConfigModal';
import ComplaintStagesConfigModal from '../../components/personal/ComplaintStagesConfigModal';

// Drag-and-drop HTML5 nativo (sin librería). Desde la Fase 5 las columnas ya
// no son fijas: se cargan como ComplaintStage[] configurable por empresa
// (ver ComplaintStagesConfigModal), ordenadas por `order`, con su propio
// `color` en vez del STAGE_COLOR hardcodeado de antes.
export default function ComplaintsManagementPage() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canManage = canWrite('RRHH');

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [fields, setFields] = useState<ComplaintFieldDefinition[]>([]);
  const [stages, setStages] = useState<ComplaintStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedComplaint, setDraggedComplaint] = useState<Complaint | null>(null);
  const [detail, setDetail] = useState<Complaint | null>(null);
  const [notes, setNotes] = useState('');
  const [savingStage, setSavingStage] = useState(false);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);
  const [showStagesConfig, setShowStagesConfig] = useState(false);
  const [moverQuejaError, setMoverQuejaError] = useState('');
  const moverQuejaErrorRef = useRef<HTMLDivElement>(null);
  const [avanzarEtapaError, setAvanzarEtapaError] = useState('');
  const avanzarEtapaErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moverQuejaError) {
      moverQuejaErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [moverQuejaError]);

  useEffect(() => {
    if (avanzarEtapaError) {
      avanzarEtapaErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [avanzarEtapaError]);

  const load = () => {
    setLoading(true);
    Promise.all([getAllComplaints(), getComplaintFields(), getComplaintStages()])
      .then(([c, f, s]) => { setComplaints(c); setFields(f); setStages(s); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const getComplaintsForStage = (key: string) => complaints.filter((c) => c.status === key);
  const stageLabel = (key: string) => stages.find((s) => s.key === key)?.label || key;

  const handleDragStart = (e: React.DragEvent, complaint: Complaint) => {
    setDraggedComplaint(complaint);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (!draggedComplaint || draggedComplaint.status === key) { setDraggedComplaint(null); return; }
    setMoverQuejaError('');
    try {
      await changeComplaintStage(draggedComplaint.id, { toStatus: key });
    } catch (err: any) {
      setMoverQuejaError(err.response?.data?.message || 'No se pudo mover la queja o sugerencia.');
    } finally {
      setDraggedComplaint(null);
      load();
    }
  };

  const openDetail = (c: Complaint) => {
    setDetail(c);
    setNotes('');
    setAvanzarEtapaError('');
  };

  const currentIndex = detail ? stages.findIndex((s) => s.key === detail.status) : -1;
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : undefined;

  const handleAdvanceFromDetail = async () => {
    if (!detail || !nextStage) return;
    setSavingStage(true);
    setAvanzarEtapaError('');
    try {
      await changeComplaintStage(detail.id, { toStatus: nextStage.key, notes: notes.trim() || undefined });
      setDetail(null);
      load();
    } catch (err: any) {
      setAvanzarEtapaError(err.response?.data?.message || 'No se pudo actualizar la etapa.');
    } finally {
      setSavingStage(false);
    }
  };

  if (!canManage) return null;
  if (loading) return <div className="loading-state">Cargando quejas y sugerencias...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Gestión de Quejas y Sugerencias</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="btn-icon-toolbar"
              onClick={() => setShowStagesConfig(true)}
              title="Etapas del tablero"
              aria-label="Etapas del tablero"
            >
              <ListOrdered size={18} />
            </button>
            <button
              type="button"
              className="btn-icon-toolbar"
              onClick={() => setShowFieldsConfig(true)}
              title="Campos del formulario"
              aria-label="Campos del formulario"
            >
              <Settings2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {showFieldsConfig && <ComplaintFieldsConfigModal onClose={() => setShowFieldsConfig(false)} />}
      {showStagesConfig && (
        <ComplaintStagesConfigModal
          onClose={() => setShowStagesConfig(false)}
          onChanged={load}
        />
      )}

      {moverQuejaError && (
        <div ref={moverQuejaErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{moverQuejaError}</div>
      )}

      <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '16px' }}>
        Arrastra una tarjeta entre columnas para avanzar su etapa, o haz click para ver el detalle y el historial.
      </p>

      {stages.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: '#a0aec0' }}>
          Esta empresa aún no tiene etapas configuradas. Usa el botón de etapas (arriba a la derecha) para crear la primera.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', alignItems: 'flex-start' }}>
          {stages.map((stage) => (
            <div
              key={stage.key}
              onDrop={(e) => handleDrop(e, stage.key)}
              onDragOver={handleDragOver}
              style={{
                minWidth: '260px', maxWidth: '300px', flex: '1 0 260px',
                background: '#f7fafc', borderRadius: '12px', border: '1px solid #e2e8f0',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '12px 16px', borderBottom: `3px solid ${stage.color}` }}>
                <strong style={{ color: 'var(--azul-oscuro)' }}>{stage.label}</strong>
                <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#718096' }}>
                  ({getComplaintsForStage(stage.key).length})
                </span>
              </div>
              <div style={{ padding: '8px', flex: 1, minHeight: '100px' }}>
                {getComplaintsForStage(stage.key).map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, c)}
                    onClick={() => openDetail(c)}
                    style={{
                      background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '8px',
                      border: '1px solid #e2e8f0', cursor: 'grab',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#a0aec0', marginBottom: '4px' }}>
                      {c.isAnonymous ? 'Anónima' : c.submitter?.fullName || 'Empleado'} · {new Date(c.createdAt).toLocaleDateString('es-EC')}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {c.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detalle de la queja o sugerencia</h3>
              <button className="modal-close" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '0.78rem', color: '#a0aec0', marginBottom: '8px' }}>
                {detail.isAnonymous ? 'Anónima' : detail.submitter?.fullName || 'Empleado'} · {new Date(detail.createdAt).toLocaleDateString('es-EC')}
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>{detail.description}</p>

              {avanzarEtapaError && (
                <div ref={avanzarEtapaErrorRef} className="form-error" style={{ marginBottom: '10px' }}>{avanzarEtapaError}</div>
              )}

              {fields.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {fields.map((f) => (
                    <div key={f.id} style={{ fontSize: '0.8rem', color: '#718096' }}>
                      <strong>{f.label}:</strong>{' '}
                      {detail.customFieldValues?.[String(f.id)] || <em style={{ color: '#a0aec0' }}>No especificado</em>}
                    </div>
                  ))}
                </div>
              )}

              {detail.stageChanges && detail.stageChanges.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>Historial</p>
                  {detail.stageChanges.map((sc) => (
                    <div key={sc.id} style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '4px' }}>
                      {new Date(sc.createdAt).toLocaleDateString('es-EC')} — {sc.changer?.fullName || 'RRHH'} movió a <strong>{stageLabel(sc.toStatus)}</strong>
                      {sc.notes && <>: {sc.notes}</>}
                    </div>
                  ))}
                </div>
              )}

              {nextStage && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                  <div className="form-group">
                    <label>Nota (opcional)</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
              {nextStage && (
                <button className="auth-btn" onClick={handleAdvanceFromDetail} disabled={savingStage}>
                  {savingStage ? 'Guardando...' : `Avanzar a "${nextStage.label}"`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
