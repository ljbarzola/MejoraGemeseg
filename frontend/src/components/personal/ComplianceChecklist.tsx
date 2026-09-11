import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { reviewDocument, reassignDocumentType } from '../../services/personal.service';
import { updateDocumentExpiry, extractDocumentExpiry } from '../../services/entidades.service';
import { usePerm } from '../../contexts/PermissionsContext';
import DocumentReviewModal from './DocumentReviewModal';
import { REVIEW_COLORS, STALE_COLOR } from './reviewStatus';

interface Props {
  compliance: any;
  /** Se llama tras aprobar o rechazar, para recargar cumplimiento e historial. */
  onReviewed?: () => void;
  /** Modo solo lectura: muestra los estados pero no permite revisar. */
  readOnly?: boolean;
  /**
   * Opt-in: muestra un control inline en cada fila con documento para fijar/editar
   * su fecha de emisión/vencimiento (módulo de Cumplimiento por Entidad). Cuando no
   * se pasa (o es false), el comportamiento del componente queda 100% igual al actual.
   */
  allowExpiryEdit?: boolean;
  /** Se llama tras guardar una fecha de vencimiento, para que el padre recargue datos. */
  onExpiryUpdated?: () => void;
  /**
   * Opt-in adicional (requiere allowExpiryEdit=true): agrega un botón "Leer con IA"
   * que propone fecha de emisión/vencimiento a partir del PDF ya sincronizado. Nunca
   * guarda solo — RRHH debe revisar los valores pre-rellenados y pulsar "Guardar"
   * igual que en la edición manual. Por defecto false: no afecta a los demás
   * consumidores de este componente (CompliancePanel/AdministrativeStaff/GuardiaDetailModal).
   */
  allowAiExtract?: boolean;
}

type Target = { key: string; documentTypeId?: number; driveFileId?: string; label: string; fileName?: string | null };

type RequisitoEstadoUI = 'CUMPLIDO' | 'FALTANTE' | 'VENCIDO' | 'POR_VENCER';

// Solo se usa cuando allowExpiryEdit=true y el consumidor (Cumplimiento por Entidad)
// rellena doc.estado con el valor que ya calculó el backend — este componente no
// vuelve a comparar fechas por su cuenta para decidir CUMPLIDO/FALTANTE/VENCIDO/POR_VENCER.
// Semáforo: verde = al día, amarillo = por vencer (dentro de la ventana de aviso),
// rojo = requiere acción ya (vencido o nunca se subió).
const ESTADO_STYLES: Record<RequisitoEstadoUI, { bg: string; border: string; badgeBg: string; badgeFg: string; icon: string }> = {
  CUMPLIDO: { bg: '#f0fff4', border: '#c6f6d5', badgeBg: '#c6f6d5', badgeFg: '#276749', icon: '✅' },
  POR_VENCER: { bg: '#fffbeb', border: '#fefcbf', badgeBg: '#fefcbf', badgeFg: '#975a16', icon: '⏳' },
  VENCIDO: { bg: '#fff5f5', border: '#fed7d7', badgeBg: '#fed7d7', badgeFg: '#c53030', icon: '⛔' },
  FALTANTE: { bg: '#fff5f5', border: '#fed7d7', badgeBg: '#fed7d7', badgeFg: '#c53030', icon: '❌' },
};

/** Formato de fecha de este módulo: DD/MM/YYYY, nunca ISO crudo (RECOMENDACIONES_UX_UI §5). */
function formatFecha(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function toDateInputValue(value?: string | Date | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Mismo esquema de color que ESTADO_STYLES (verde/ámbar/rojo ya usados en este
// archivo para CUMPLIDO/VENCIDO/FALTANTE), reutilizado para la confianza que
// reporta la IA — así "alta/media/baja" se lee con el mismo lenguaje visual
// que el resto del módulo en vez de introducir una paleta nueva.
const CONFIANZA_STYLES: Record<'alta' | 'media' | 'baja', { bg: string; fg: string }> = {
  alta: { bg: '#c6f6d5', fg: '#276749' },
  media: { bg: '#fefcbf', fg: '#975a16' },
  baja: { bg: '#fed7d7', fg: '#c53030' },
};

function ExpiryEditor({ doc, onSaved, allowAiExtract }: { doc: any; onSaved?: () => void; allowAiExtract?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [issueDate, setIssueDate] = useState(() => toDateInputValue(doc.issueDate));
  const [expiryDate, setExpiryDate] = useState(() => toDateInputValue(doc.expiryDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{ confianza: 'alta' | 'media' | 'baja'; notas: string | null } | null>(null);

  const isExpired = !!doc.expiryDate && new Date(doc.expiryDate) < new Date();
  const formattedExpiry = formatFecha(doc.expiryDate);

  const handleExtract = async () => {
    setAiLoading(true);
    setAiError('');
    setAiSuggestion(null);
    try {
      const result = await extractDocumentExpiry(doc.driveFileId);
      if (result.success) {
        if (result.fechaEmision) setIssueDate(result.fechaEmision);
        if (result.fechaVencimiento) setExpiryDate(result.fechaVencimiento);
        setAiSuggestion({ confianza: result.confianza || 'baja', notas: result.notas ?? null });
      } else {
        setAiError(result.message || 'No se pudo leer este PDF automáticamente. Ingresa la fecha manualmente.');
      }
    } catch (err: any) {
      setAiError(err.response?.data?.message || 'No se pudo leer este PDF automáticamente. Ingresa la fecha manualmente.');
    } finally {
      setAiLoading(false);
      setEditing(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateDocumentExpiry(doc.driveFileId, {
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
      });
      setEditing(false);
      setAiSuggestion(null);
      setAiError('');
      onSaved?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la fecha.');
    } finally {
      setSaving(false);
    }
  };

  const AiButton = ({ compact }: { compact?: boolean }) => (
    <button
      type="button"
      disabled={aiLoading}
      onClick={handleExtract}
      title="Proponer fecha de emisión/vencimiento leyendo el PDF con IA — siempre debes revisar y guardar"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: compact ? '3px 8px' : '5px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
        border: '1px solid #d6bcfa', background: aiLoading ? '#f3e8ff' : '#faf5ff', color: '#6b46c1',
        cursor: aiLoading ? 'default' : 'pointer', opacity: aiLoading ? 0.7 : 1, whiteSpace: 'nowrap',
      }}
    >
      <Sparkles size={12} />
      {aiLoading ? 'Leyendo con IA...' : 'Leer con IA'}
    </button>
  );

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isExpired ? '#c53030' : '#4a5568' }}>
          {formattedExpiry ? `Vence: ${formattedExpiry}` : 'Sin fecha de vencimiento'}
        </span>
        {isExpired && (
          <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>Vencido</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{ border: 'none', background: 'none', color: 'var(--azul-claro)', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', padding: 0 }}
        >
          {formattedExpiry ? 'Editar fecha' : 'Definir fecha de vencimiento'}
        </button>
        {allowAiExtract && <AiButton compact />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      {error && <div style={{ color: '#c53030', fontSize: '0.75rem' }}>{error}</div>}
      {allowAiExtract && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AiButton />
          {aiSuggestion && (
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600, background: CONFIANZA_STYLES[aiSuggestion.confianza].bg, color: CONFIANZA_STYLES[aiSuggestion.confianza].fg }}>
              Sugerido por IA · confianza: {aiSuggestion.confianza}
            </span>
          )}
        </div>
      )}
      {aiSuggestion?.notas && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#718096', fontStyle: 'italic', lineHeight: 1.5 }}>{aiSuggestion.notas}</p>
      )}
      {aiError && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#c53030', lineHeight: 1.5 }}>{aiError}</p>
      )}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.72rem', color: '#718096', display: 'flex', flexDirection: 'column', gap: '2px', flex: '1 1 160px' }}>
          Fecha de emisión
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#718096', display: 'flex', flexDirection: 'column', gap: '2px', flex: '1 1 160px' }}>
          Fecha de vencimiento
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="auth-btn"
          disabled={saving}
          onClick={handleSave}
          style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => { setEditing(false); setAiError(''); setAiSuggestion(null); }}
          style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ReviewBadge({ review }: { review: any }) {
  if (!review) return null;
  const color = REVIEW_COLORS[review.status] || REVIEW_COLORS.PENDIENTE;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600,
      background: color.bg, color: color.fg, whiteSpace: 'nowrap',
    }}>
      {review.status}
    </span>
  );
}

/**
 * Deja que RRHH le diga al sistema "este archivo adicional en realidad es el
 * documento requerido X" (p. ej. la cédula subida como adicional en vez de en
 * su casilla). Renombra el archivo en Drive para que el matching automático lo
 * reconozca; `onDone` recarga el cumplimiento para que el archivo pase a
 * mostrarse en su fila del checklist.
 */
function ReassignControl({
  driveFileId,
  missingTypes,
  onDone,
}: {
  driveFileId?: string;
  missingTypes: { documentTypeId: number; type: string }[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!driveFileId || missingTypes.length === 0) return null;

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await reassignDocumentType(driveFileId, Number(selected));
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo reasignar el archivo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={saving}
        style={{ fontSize: '0.75rem', padding: '5px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', maxWidth: '160px' }}
      >
        <option value="">Es el documento...</option>
        {missingTypes.map((t) => (
          <option key={t.documentTypeId} value={t.documentTypeId}>{t.type}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || saving}
        onClick={handleAssign}
        style={{
          padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', border: 'none',
          background: '#3182ce', color: 'white', whiteSpace: 'nowrap',
          cursor: !selected || saving ? 'default' : 'pointer', opacity: !selected || saving ? 0.5 : 1,
        }}
      >
        {saving ? '⏳' : 'Asignar'}
      </button>
      {error && <span style={{ fontSize: '0.72rem', color: '#c53030' }}>{error}</span>}
    </div>
  );
}

export default function ComplianceChecklist({ compliance, onReviewed, readOnly, allowExpiryEdit, onExpiryUpdated, allowAiExtract }: Props) {
  const { canWrite } = usePerm();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Target | null>(null);
  const [error, setError] = useState('');

  const canReview = !readOnly && canWrite('RRHH');

  const send = async (target: Target, status: 'APROBADO' | 'RECHAZADO', reason?: string) => {
    setPendingKey(target.key);
    setError('');
    try {
      await reviewDocument({
        cedula: compliance.cedula,
        documentTypeId: target.documentTypeId,
        driveFileId: target.driveFileId,
        fileName: target.fileName || undefined,
        status,
        reason,
      });
      setRejectTarget(null);
      onReviewed?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la revisión.');
    } finally {
      setPendingKey(null);
    }
  };

  const ReviewActions = ({ target }: { target: Target }) => {
    if (!canReview) return null;
    const busy = pendingKey === target.key;
    const btn = (bg: string) => ({
      padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', border: 'none',
      background: bg, color: 'white', cursor: busy ? 'default' : 'pointer',
      opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' as const,
    });
    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button disabled={busy} style={btn('#276749')} onClick={() => send(target, 'APROBADO')}>
          {busy ? '⏳' : '✔ Aprobar'}
        </button>
        <button disabled={busy} style={btn('#c53030')} onClick={() => setRejectTarget(target)}>
          ✖ Rechazar
        </button>
      </div>
    );
  };

  return (
    <>
      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {compliance.documents.map((doc: any, i: number) => {
          const target: Target = {
            key: `type-${doc.documentTypeId ?? i}`,
            documentTypeId: doc.documentTypeId,
            driveFileId: doc.driveFileId || undefined,
            label: doc.type,
            fileName: doc.fileName,
          };
          // `doc.estado` (CUMPLIDO/FALTANTE/VENCIDO) solo lo rellena el consumidor
          // de Cumplimiento por Entidad cuando allowExpiryEdit está activo — el resto
          // de usos de este componente nunca lo setean, así que estadoStyle queda
          // null y toda la fila cae en las mismas ramas de siempre (present/missing).
          const estadoStyle = allowExpiryEdit && doc.estado ? ESTADO_STYLES[doc.estado as RequisitoEstadoUI] : null;
          return (
            <div
              key={target.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                flexWrap: 'wrap', borderRadius: '10px',
                background: !doc.required ? '#f7fafc' : estadoStyle ? estadoStyle.bg : doc.status === 'present' ? '#f0fff4' : '#fff5f5',
                border: `1px solid ${!doc.required ? '#e2e8f0' : estadoStyle ? estadoStyle.border : doc.status === 'present' ? '#c6f6d5' : '#fed7d7'}`,
                opacity: !doc.required ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: '1.2rem', marginTop: '2px' }}>
                {!doc.required ? '➖' : estadoStyle ? estadoStyle.icon : doc.status === 'present' ? '✅' : '❌'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>
                    {doc.type}
                    {doc.required && <span style={{ color: '#c53030', marginLeft: '4px' }}>*</span>}
                    {!doc.required && <span style={{ color: '#a0aec0', marginLeft: '4px', fontSize: '0.75rem' }}>(no requerido en esta etapa)</span>}
                  </span>
                  {estadoStyle && (
                    <span className="status-badge" style={{ background: estadoStyle.badgeBg, color: estadoStyle.badgeFg }}>
                      {doc.estado}
                    </span>
                  )}
                  <ReviewBadge review={doc.review} />
                  {doc.review?.stale && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600,
                      background: STALE_COLOR.bg, color: STALE_COLOR.fg,
                    }}>
                      ⚠️ Archivo cambió — requiere nueva revisión
                    </span>
                  )}
                </div>
                {doc.fileName && (
                  <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '2px' }}>
                    📄 {doc.fileName}
                    {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString('es-EC')}`}
                  </div>
                )}
                {doc.review?.status === 'RECHAZADO' && doc.review.reason && (
                  <div style={{ fontSize: '0.78rem', color: '#c53030', marginTop: '2px' }}>
                    Motivo: {doc.review.reason}
                  </div>
                )}
                {doc.review?.reviewedBy && (
                  <div style={{ fontSize: '0.72rem', color: '#a0aec0', marginTop: '2px' }}>
                    Revisado por {doc.review.reviewedBy}
                    {doc.review.reviewedAt && ` · ${new Date(doc.review.reviewedAt).toLocaleDateString('es-EC')}`}
                  </div>
                )}
                {allowExpiryEdit && doc.driveFileId && (
                  <ExpiryEditor doc={doc} onSaved={onExpiryUpdated} allowAiExtract={allowAiExtract} />
                )}
              </div>
              <div
                style={
                  allowExpiryEdit
                    ? { display: 'flex', gap: '8px', flexWrap: 'wrap', flexBasis: '100%', marginLeft: '32px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }
                    : { display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0, marginTop: '1px' }
                }
              >
                {doc.fileUrl && (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem',
                      background: 'var(--azul-claro)', color: 'white', textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    Ver archivo
                  </a>
                )}
                {doc.status === 'present' && <ReviewActions target={target} />}
              </div>
            </div>
          );
        })}
      </div>

      {compliance.unmatchedFiles && compliance.unmatchedFiles.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', color: '#d69e2e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚠️ Archivos sin reconocer ({compliance.unmatchedFiles.length})
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#718096', marginBottom: '12px' }}>
            Estos archivos están en la carpeta pero no coinciden con ningún tipo de documento requerido. Puede ser un mal tipeado o un archivo adicional.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(() => {
              const missingTypes = compliance.documents
                .filter((d: any) => d.status === 'missing')
                .map((d: any) => ({ documentTypeId: d.documentTypeId, type: d.type }));
              return compliance.unmatchedFiles.map((file: any, i: number) => {
              const target: Target = {
                key: `file-${file.driveFileId ?? i}`,
                driveFileId: file.driveFileId,
                label: file.fileName,
                fileName: file.fileName,
              };
              return (
                <div
                  key={target.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    borderRadius: '8px', background: '#fffbeb', border: '1px solid #fefcbf',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.85rem', color: '#975a16' }}>{file.fileName}</span>
                      <ReviewBadge review={file.review} />
                    </div>
                    {file.uploadedAt && (
                      <div style={{ fontSize: '0.75rem', color: '#b7791f', marginTop: '2px' }}>
                        Subido: {new Date(file.uploadedAt).toLocaleDateString('es-EC')}
                      </div>
                    )}
                    {file.review?.status === 'RECHAZADO' && file.review.reason && (
                      <div style={{ fontSize: '0.75rem', color: '#c53030', marginTop: '2px' }}>
                        Motivo: {file.review.reason}
                      </div>
                    )}
                  </div>
                  {file.fileUrl && (
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem',
                        background: '#d69e2e', color: 'white', textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      Ver
                    </a>
                  )}
                  <ReviewActions target={target} />
                  {canReview && (
                    <ReassignControl
                      driveFileId={file.driveFileId}
                      missingTypes={missingTypes}
                      onDone={() => onReviewed?.()}
                    />
                  )}
                </div>
              );
              });
            })()}
          </div>
        </div>
      )}

      <DocumentReviewModal
        open={!!rejectTarget}
        documentType={rejectTarget?.label || ''}
        fileName={rejectTarget?.fileName}
        saving={!!rejectTarget && pendingKey === rejectTarget.key}
        onConfirm={(reason) => rejectTarget && send(rejectTarget, 'RECHAZADO', reason)}
        onClose={() => setRejectTarget(null)}
      />
    </>
  );
}
