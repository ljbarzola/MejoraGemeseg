import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDriveTree, getDriveCompliance, syncDriveFolder, deleteDriveEmployee, reviewDocument, getDocumentReviews } from '../../../services/personal.service';

const REVIEW_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  APROBADO: { label: 'Aprobado', bg: '#c6f6d5', color: '#276749' },
  RECHAZADO: { label: 'Rechazado', bg: '#fed7d7', color: '#c53030' },
  PENDIENTE: { label: 'Sin revisar', bg: '#edf2f7', color: '#4a5568' },
};

export default function CompliancePanel() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<any>({ CUSTODIAS: [], PERSONAL: [] });
  const [selectedFolder] = useState<'CUSTODIAS'>('CUSTODIAS');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  // Sprint 3 — aprobacion/rechazo documental
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewTarget, setReviewTarget] = useState<{ documentId: number; fileName: string; status: 'APROBADO' | 'RECHAZADO' } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const selectedCedulaRef = useRef<string | null>(null);

  const loadTree = () => {
    setLoading(true);
    getDriveTree().then(setTree).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadTree(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      await syncDriveFolder();
      loadTree();
    } catch (err: any) {
      setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Google Drive. Verifica la configuraci�n de Drive.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectEmployee = async (emp: any) => {
    setSelectedEmployee(emp);
    setLoadingCompliance(true);
    setReviews([]);
    // Si el usuario cambia de empleado mientras una respuesta lenta esta en vuelo,
    // descartamos la que ya no corresponde en lugar de pintarla sobre la nueva.
    selectedCedulaRef.current = emp.cedula;
    try {
      const data = await getDriveCompliance(emp.cedula);
      if (selectedCedulaRef.current !== emp.cedula) return;
      setCompliance(data);
    } catch {
      if (selectedCedulaRef.current === emp.cedula) setCompliance(null);
    } finally {
      if (selectedCedulaRef.current === emp.cedula) setLoadingCompliance(false);
    }
    // El historial es independiente del checklist: si falla, la pantalla sigue util.
    getDocumentReviews(emp.cedula)
      .then((data) => { if (selectedCedulaRef.current === emp.cedula) setReviews(data); })
      .catch(() => { if (selectedCedulaRef.current === emp.cedula) setReviews([]); });
  };

  const openReview = (documentId: number, fileName: string, status: 'APROBADO' | 'RECHAZADO') => {
    setReviewTarget({ documentId, fileName, status });
    setReviewReason('');
    setReviewError('');
  };

  const handleSubmitReview = async () => {
    if (!reviewTarget) return;
    setSavingReview(true);
    setReviewError('');
    try {
      await reviewDocument(reviewTarget.documentId, {
        status: reviewTarget.status,
        reason: reviewReason.trim() || undefined,
      });
      setReviewTarget(null);
      if (selectedEmployee) await handleSelectEmployee(selectedEmployee);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setReviewError(Array.isArray(msg) ? msg.join('. ') : msg || 'No se pudo registrar la revisión.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteEmployee = async (e: React.MouseEvent, emp: any) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de eliminar a ${emp.employeeName}? Se borrará su registro de Drive y candidato.`)) return;
    try {
      await deleteDriveEmployee(emp.cedula);
      if (selectedEmployee?.cedula === emp.cedula) {
        setSelectedEmployee(null);
        setCompliance(null);
      }
      loadTree();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  const currentList = tree[selectedFolder] || [];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MODULO PERSONAL</p>
          <h1>Panel de Cumplimiento</h1>
          <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: '4px' }}>
            Estado de documentos de cada empleado en Google Drive
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <button
            className="auth-btn"
            onClick={handleSync}
            disabled={syncing}
            style={{ opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar Drive'}
          </button>
        </div>
      </div>

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
        <div style={{ width: '320px', flexShrink: 0 }}>
          <div className="admin-section">
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>
              🛡️ Custodios ({(tree.CUSTODIAS || []).length})
            </h3>

            {loading ? (
              <div className="loading-state">Cargando...</div>
            ) : currentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#a0aec0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📂</div>
                <p>No hay carpetas en Drive</p>
                <p style={{ fontSize: '0.8rem', marginTop: '8px' }}>
                  Configura la carpeta raíz en{' '}
                  <span
                    style={{ color: 'var(--azul-claro)', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => navigate('/personal/drive-config')}
                  >
                    Configuración de Drive
                  </span>
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {currentList.map((emp: any) => (
                  <div
                    key={emp.cedula}
                    onClick={() => handleSelectEmployee(emp)}
                    style={{
                      padding: '12px', marginBottom: '8px', borderRadius: '10px',
                      border: selectedEmployee?.cedula === emp.cedula ? '2px solid var(--azul-claro)' : '1px solid #e2e8f0',
                      background: selectedEmployee?.cedula === emp.cedula ? '#ebf8ff' : 'white',
                      cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>
                        {emp.employeeName}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '2px' }}>
                        CC: {emp.cedula} · {emp.documentCount} archivos
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteEmployee(e, emp)}
                      title="Eliminar de la lista"
                      style={{
                        background: 'none', border: 'none', color: '#e53e3e', fontSize: '1rem',
                        cursor: 'pointer', padding: '4px 8px', borderRadius: '4px',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = '#fed7d7')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {loadingCompliance ? (
            <div className="admin-section">
              <div className="loading-state">Cargando cumplimiento...</div>
            </div>
          ) : compliance ? (
            <div className="admin-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: 0, color: 'var(--azul-oscuro)' }}>{compliance.employee}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#718096' }}>
                    CC: {compliance.cedula} · Carpeta: {compliance.folder}
                  </p>
                  {compliance.stage && (
                    <span style={{
                      display: 'inline-block', marginTop: '6px', padding: '3px 10px', borderRadius: '12px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: compliance.stage === 'Activo' ? '#c6f6d5' : compliance.stage === 'Contratado' ? '#fefcbf' : '#bee3f8',
                      color: compliance.stage === 'Activo' ? '#276749' : compliance.stage === 'Contratado' ? '#975a16' : '#2b6cb0',
                    }}>
                      {compliance.stage}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '2rem', fontWeight: 800,
                  color: compliance.compliancePercent >= 80 ? '#276749' : compliance.compliancePercent >= 50 ? '#d69e2e' : '#c53030',
                }}>
                  {compliance.compliancePercent}%
                </div>
              </div>

              <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '8px', marginBottom: '24px', overflow: 'hidden' }}>
                <div style={{
                  width: `${compliance.compliancePercent}%`, height: '100%', borderRadius: '8px',
                  background: compliance.compliancePercent >= 80 ? '#276749' : compliance.compliancePercent >= 50 ? '#d69e2e' : '#c53030',
                  transition: 'width 0.5s',
                }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {compliance.documents.map((doc: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                      borderRadius: '10px',
                      background: !doc.required ? '#f7fafc' : doc.status === 'present' ? '#f0fff4' : '#fff5f5',
                      border: `1px solid ${!doc.required ? '#e2e8f0' : doc.status === 'present' ? '#c6f6d5' : '#fed7d7'}`,
                      opacity: !doc.required ? 0.6 : 1,
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>
                      {!doc.required ? '➖' : doc.status === 'present' ? '✅' : '❌'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>
                        {doc.type}
                        {doc.required && <span style={{ color: '#c53030', marginLeft: '4px' }}>*</span>}
                        {!doc.required && <span style={{ color: '#a0aec0', marginLeft: '4px', fontSize: '0.75rem' }}>(no requerido en esta etapa)</span>}
                      </div>
                      {doc.fileName && (
                        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '2px' }}>
                          📄 {doc.fileName}
                          {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString('es-EC')}`}
                        </div>
                      )}
                      {doc.status === 'present' && doc.reviewStatus && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="status-badge" style={{
                            backgroundColor: (REVIEW_BADGE[doc.reviewStatus] || REVIEW_BADGE.PENDIENTE).bg,
                            color: (REVIEW_BADGE[doc.reviewStatus] || REVIEW_BADGE.PENDIENTE).color,
                            fontSize: '0.7rem',
                          }}>
                            {(REVIEW_BADGE[doc.reviewStatus] || REVIEW_BADGE.PENDIENTE).label}
                          </span>
                          {doc.reviewReason && (
                            <span style={{ fontSize: '0.75rem', color: '#c53030' }}>Motivo: {doc.reviewReason}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {doc.status === 'present' && doc.documentId && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => openReview(doc.documentId, doc.fileName, 'APROBADO')}
                          title="Aprobar documento"
                          style={{
                            padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                            background: '#c6f6d5', color: '#276749', border: '1px solid #9ae6b4',
                          }}
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => openReview(doc.documentId, doc.fileName, 'RECHAZADO')}
                          title="Rechazar documento (requiere motivo)"
                          style={{
                            padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                            background: '#fed7d7', color: '#c53030', border: '1px solid #feb2b2',
                          }}
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                    {doc.fileUrl && (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem',
                          background: 'var(--azul-claro)', color: 'white', textDecoration: 'none',
                        }}
                      >
                        Ver archivo
                      </a>
                    )}
                  </div>
                ))}
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
                    {compliance.unmatchedFiles.map((file: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                          borderRadius: '8px', background: '#fffbeb', border: '1px solid #fefcbf',
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>📄</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.85rem', color: '#975a16' }}>
                            {file.fileName}
                          </div>
                          {file.uploadedAt && (
                            <div style={{ fontSize: '0.75rem', color: '#b7791f', marginTop: '2px' }}>
                              Subido: {new Date(file.uploadedAt).toLocaleDateString('es-EC')}
                            </div>
                          )}
                          {file.reviewStatus && (
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="status-badge" style={{
                                backgroundColor: (REVIEW_BADGE[file.reviewStatus] || REVIEW_BADGE.PENDIENTE).bg,
                                color: (REVIEW_BADGE[file.reviewStatus] || REVIEW_BADGE.PENDIENTE).color,
                                fontSize: '0.7rem',
                              }}>
                                {(REVIEW_BADGE[file.reviewStatus] || REVIEW_BADGE.PENDIENTE).label}
                              </span>
                              {file.reviewReason && (
                                <span style={{ fontSize: '0.75rem', color: '#c53030' }}>Motivo: {file.reviewReason}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {file.documentId && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => openReview(file.documentId, file.fileName, 'APROBADO')}
                              style={{ padding: '5px 9px', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', background: '#c6f6d5', color: '#276749', border: '1px solid #9ae6b4' }}
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => openReview(file.documentId, file.fileName, 'RECHAZADO')}
                              style={{ padding: '5px 9px', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', background: '#fed7d7', color: '#c53030', border: '1px solid #feb2b2' }}
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                        {file.fileUrl && (
                          <a
                            href={file.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem',
                              background: '#d69e2e', color: 'white', textDecoration: 'none',
                            }}
                          >
                            Ver
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviews.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ fontSize: '0.95rem', color: 'var(--azul-oscuro)', marginBottom: '10px' }}>
                    🕘 Historial de aprobaciones y rechazos ({reviews.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {reviews.map((r: any) => {
                      const badge = REVIEW_BADGE[r.status] || REVIEW_BADGE.PENDIENTE;
                      return (
                        <div
                          key={r.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px',
                            borderRadius: '8px', background: '#f7fafc', border: '1px solid #e2e8f0',
                          }}
                        >
                          <span className="status-badge" style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '0.7rem' }}>
                            {badge.label}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--azul-oscuro)' }}>{r.fileName}</div>
                            {r.reason && (
                              <div style={{ fontSize: '0.78rem', color: '#4a5568', marginTop: '2px' }}>Motivo: {r.reason}</div>
                            )}
                            <div style={{ fontSize: '0.73rem', color: '#a0aec0', marginTop: '2px' }}>
                              {r.reviewer?.fullName || r.reviewer?.email || 'Usuario'} · {new Date(r.createdAt).toLocaleString('es-EC')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {compliance.lastSyncAt && (
                <p style={{ marginTop: '16px', fontSize: '0.78rem', color: '#a0aec0', textAlign: 'center' }}>
                  Última sincronización: {new Date(compliance.lastSyncAt).toLocaleString('es-EC')}
                </p>
              )}
            </div>
          ) : (
            <div className="admin-section">
              <div style={{ textAlign: 'center', padding: '64px 32px', color: '#a0aec0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📋</div>
                <h3 style={{ color: '#718096', marginBottom: '8px' }}>Selecciona un empleado</h3>
                <p style={{ fontSize: '0.9rem' }}>Haz clic en un empleado de la lista para ver su estado de cumplimiento</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '440px', maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: '6px' }}>
              {reviewTarget.status === 'APROBADO' ? 'Aprobar documento' : 'Rechazar documento'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '14px' }}>📄 {reviewTarget.fileName}</p>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>
                Motivo {reviewTarget.status === 'RECHAZADO'
                  ? <span style={{ color: '#c53030' }}>*</span>
                  : <span style={{ color: '#a0aec0', fontWeight: 400 }}>(opcional)</span>}
              </label>
              <textarea
                className="form-input"
                rows={3}
                maxLength={500}
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder={reviewTarget.status === 'RECHAZADO'
                  ? 'Ej: la cédula está ilegible, falta el reverso del documento...'
                  : 'Comentario para dejar constancia (opcional)'}
              />
            </div>

            {reviewError && (
              <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', marginBottom: '12px' }}>
                {reviewError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setReviewTarget(null)} disabled={savingReview}>Cancelar</button>
              <button
                className="auth-btn"
                onClick={handleSubmitReview}
                disabled={savingReview || (reviewTarget.status === 'RECHAZADO' && reviewReason.trim().length < 3)}
              >
                {savingReview ? 'Guardando...' : reviewTarget.status === 'APROBADO' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
