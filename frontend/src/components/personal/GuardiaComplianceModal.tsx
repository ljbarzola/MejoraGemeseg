import { useState, useEffect } from 'react';
import { X, Send, Mail, MessageCircle, Pencil, Check } from 'lucide-react';
import {
  getComplianceForGuardia,
  enviarRecordatorio,
  getGuardiaContacto,
  setGuardiaContacto,
  type ComplianceGuardiaDetail,
  type MedioRecordatorio,
} from '../../services/entidades.service';
import ComplianceChecklist from './ComplianceChecklist';
import { usePerm } from '../../contexts/PermissionsContext';

// Mapea la respuesta de /cumplimiento-entidades/:cedula (lista de RequisitoConEstado)
// a la forma { documents: [...] } que espera ComplianceChecklist, para reutilizar su
// coloreado por estado y el editor de fecha de vencimiento (allowExpiryEdit).
//
// Importante: NO se rellena `documentTypeId` aquí. Los requisitos de este módulo
// (`RequisitoDocumento`) viven en un espacio de IDs totalmente distinto al de
// `DocumentType` (el checklist de Custodios/Personal Administrativo) — pero ambos
// comparten la misma tabla `DocumentReview`, que valida `documentTypeId` contra
// `DocumentType` en el backend (ver `DocumentReviewService.review`). Si se pasara
// `r.requisito.id` como `documentTypeId`, aprobar/rechazar aquí fallaría (o, peor,
// podría chocar con un `DocumentType` real de otro contexto que tuviera el mismo
// id). Dejando `documentTypeId` sin definir, la revisión se guarda indexada por
// `driveFileId` en su lugar — el mismo camino ya usado para "archivos sin
// reconocer" en `ComplianceChecklist`, y que no colisiona con el checklist de
// Custodios/Personal Administrativo.
function toChecklistShape(detail: ComplianceGuardiaDetail) {
  return {
    cedula: detail.cedula,
    documents: detail.requisitos.map((r) => ({
      type: r.requisito.nombre,
      required: true,
      status: r.estado === 'FALTANTE' ? 'missing' : 'present',
      estado: r.estado,
      fileName: r.documento?.fileName || null,
      fileUrl: r.documento?.fileUrl || null,
      driveFileId: r.documento?.driveFileId || null,
      uploadedAt: null,
      issueDate: r.documento?.issueDate || null,
      expiryDate: r.documento?.expiryDate || null,
    })),
    unmatchedFiles: [],
  };
}

interface Props {
  /** Cédula del guardia a mostrar; null/undefined cierra el modal. */
  cedula: string | null;
  onClose: () => void;
  /** Se llama tras guardar una fecha o aprobar/rechazar un documento, para que el padre recargue su propia lista/overview. */
  onChanged?: () => void;
}

/**
 * Modal de detalle de cumplimiento de un guardia frente a su entidad asignada.
 * Pieza reutilizable extraída de CumplimientoEntidades.tsx para que
 * GuardiasList.tsx (dashboard + directorio) pueda abrir el mismo detalle al
 * hacer clic en un guardia con asignación activa, en vez de duplicar el modal.
 */
export default function GuardiaComplianceModal({ cedula, onClose, onChanged }: Props) {
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');

  const [detail, setDetail] = useState<ComplianceGuardiaDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [medio, setMedio] = useState<MedioRecordatorio>('EMAIL');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');

  const [contactoEmail, setContactoEmail] = useState<string | null>(null);
  const [editingContacto, setEditingContacto] = useState(false);
  const [contactoInput, setContactoInput] = useState('');
  const [savingContacto, setSavingContacto] = useState(false);
  const [contactoError, setContactoError] = useState('');

  const load = () => {
    if (!cedula) return;
    setLoading(true);
    setSendResult(null);
    setSendError('');
    getComplianceForGuardia(cedula)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
    getGuardiaContacto(cedula)
      .then((c) => setContactoEmail(c?.email || null))
      .catch(() => setContactoEmail(null));
  };

  useEffect(load, [cedula]);

  if (!cedula) return null;

  const pendientes = detail?.requisitos.filter((r) => r.estado !== 'CUMPLIDO') || [];

  const openEditContacto = () => {
    setContactoInput(contactoEmail || '');
    setContactoError('');
    setEditingContacto(true);
  };

  const handleSaveContacto = async () => {
    if (!cedula) return;
    const trimmed = contactoInput.trim();
    if (!trimmed) { setContactoError('Escribe un correo.'); return; }
    setSavingContacto(true);
    setContactoError('');
    try {
      const saved = await setGuardiaContacto(cedula, trimmed);
      setContactoEmail(saved.email);
      setEditingContacto(false);
    } catch (err: any) {
      setContactoError(err.response?.data?.message || 'No se pudo guardar el correo.');
    } finally {
      setSavingContacto(false);
    }
  };

  const handleEnviarRecordatorio = async () => {
    if (!cedula) return;
    setSending(true);
    setSendResult(null);
    setSendError('');
    try {
      const result = await enviarRecordatorio(cedula, medio);
      setSendResult(result.message || `Recordatorio enviado — ${result.cantidadNotificada} documento${result.cantidadNotificada === 1 ? '' : 's'} notificado${result.cantidadNotificada === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'No se pudo enviar el recordatorio.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Detalle de Cumplimiento</h3>
            {detail?.entidad && (
              <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem' }}>
                Entidad: <strong>{detail.entidad.nombre}</strong>
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Cargando detalle...</div>
          ) : !detail ? (
            <div className="empty-state">No se pudo cargar el detalle de este guardia.</div>
          ) : !detail.tieneAsignacion ? (
            <div className="empty-state">{detail.mensaje}</div>
          ) : (
            <>
              {canEdit && (
                <div style={{ background: '#f9fafb', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Send size={15} color="var(--azul-oscuro)" />
                    <strong style={{ fontSize: '0.88rem', color: 'var(--azul-oscuro)' }}>Enviar recordatorio a este guardia</strong>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#718096' }}>
                    {pendientes.length === 0
                      ? 'Este guardia está al día, no hay nada pendiente que notificar.'
                      : `Le avisará sobre ${pendientes.length} documento${pendientes.length === 1 ? '' : 's'} faltante${pendientes.length === 1 ? '' : 's'}, vencido${pendientes.length === 1 ? '' : 's'} o por vencer.`}
                  </p>

                  <div style={{ marginBottom: '12px', padding: '8px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    {editingContacto ? (
                      <div>
                        {contactoError && <div className="form-error" style={{ marginBottom: '6px' }}>{contactoError}</div>}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="email"
                            value={contactoInput}
                            onChange={(e) => setContactoInput(e.target.value)}
                            placeholder="correo@dominio.com"
                            style={{ flex: 1, fontSize: '0.82rem' }}
                            autoFocus
                          />
                          <button type="button" className="btn-secondary" onClick={handleSaveContacto} disabled={savingContacto} style={{ padding: '6px 10px' }}>
                            <Check size={14} />
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setEditingContacto(false)} style={{ padding: '6px 10px' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', color: contactoEmail ? '#4a5568' : '#c53030' }}>
                          Correo de contacto: <strong>{contactoEmail || 'sin registrar'}</strong>
                        </span>
                        <button type="button" onClick={openEditContacto} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                          <Pencil size={12} /> {contactoEmail ? 'Editar' : 'Agregar'}
                        </button>
                      </div>
                    )}
                  </div>

                  {sendError && <div className="form-error" style={{ marginBottom: '10px' }}>{sendError}</div>}
                  {sendResult && (
                    <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.8rem' }}>
                      {sendResult}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setMedio('EMAIL')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                          background: medio === 'EMAIL' ? 'var(--azul-oscuro)' : '#fff',
                          color: medio === 'EMAIL' ? '#fff' : '#4a5568',
                        }}
                      >
                        <Mail size={14} /> Correo
                      </button>
                      <button
                        type="button"
                        disabled
                        title="WhatsApp: próximamente"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', border: 'none', borderLeft: '1px solid #e2e8f0',
                          background: '#f7fafc', color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, cursor: 'not-allowed',
                        }}
                      >
                        <MessageCircle size={14} /> WhatsApp · Próximamente
                      </button>
                    </div>

                    <button
                      className="auth-btn"
                      onClick={handleEnviarRecordatorio}
                      disabled={sending || pendientes.length === 0 || !contactoEmail}
                      title={!contactoEmail ? 'Agrega un correo de contacto primero' : undefined}
                      style={{ padding: '7px 16px', fontSize: '0.8rem' }}
                    >
                      {sending ? 'Enviando...' : 'Enviar recordatorio'}
                    </button>
                  </div>
                </div>
              )}

              <ComplianceChecklist
                compliance={toChecklistShape(detail)}
                allowExpiryEdit
                allowAiExtract
                onExpiryUpdated={() => {
                  load();
                  onChanged?.();
                }}
                onReviewed={() => {
                  load();
                  onChanged?.();
                }}
              />
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
