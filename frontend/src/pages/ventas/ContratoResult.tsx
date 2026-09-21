import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getContract, generateContractPdf, sendContract, getContractDocuments, fetchProtectedFile, uploadSignedContract, getContractSignatureStatus, SalesContract, SalesContractDocument, SignatureStatus } from '../../services/ventas.service';
import { subPageTitle } from './contratoStyles';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  GENERADO: 'PDF generado',
  ENVIADO: 'Enviado a firma',
  FIRMADO: 'Firmado',
};

// Traducción de los valores que devuelve SignWell (en inglés) a español.
const SIGNWELL_STATUS_LABELS: Record<string, string> = {
  Draft: 'Borrador', Created: 'Creado', Sending: 'Enviando', Sent: 'Enviado',
  Pending: 'Pendiente de firma', Viewed: 'Visto por el cliente', Completed: 'Firmado',
  'Manually completed': 'Firmado (manual)', Declined: 'Rechazado por el cliente',
  Canceled: 'Cancelado', Bounced: 'No entregado (rebotó)', Blocked: 'Bloqueado',
  Error: 'Error', Expired: 'Expirado',
};
const signwellStatusLabel = (s: string) => SIGNWELL_STATUS_LABELS[s] || s;

// Cuando el contrato ya se envió a firmar, regenerar el PDF o editar los
// campos no cancela ese envío en SignWell — el firmante seguiría viendo la
// versión anterior. No lo bloqueamos, pero avisamos antes de dejar seguir.
const SENT_WARNING = 'Este contrato ya se envió a firmar. Regenerar el PDF o editar los campos NO cancela ese envío en SignWell — el cliente seguiría viendo (y podría firmar) la versión anterior.';

export default function ContratoResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [contract, setContract] = useState<SalesContract | null>(null);
  const [documents, setDocuments] = useState<SalesContractDocument[]>([]);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingSigned, setUploadingSigned] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus | null>(null);
  const [pendingSentAction, setPendingSentAction] = useState<null | 'generate' | 'edit'>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  useEffect(() => { if (id) loadContract(+id); }, [id]);

  // El PDF requiere sesión iniciada, así que se descarga con el cliente
  // autenticado y se muestra como blob en vez de un <iframe src> directo.
  useEffect(() => {
    let objectUrl: string | null = null;
    if (contract?.generatedPdfPath) {
      fetchProtectedFile(contract.generatedPdfPath).then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(objectUrl);
      }).catch(() => setPdfObjectUrl(null));
    } else {
      setPdfObjectUrl(null);
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [contract?.generatedPdfPath]);

  const loadContract = async (cid: number) => {
    try {
      const c = await getContract(cid);
      setContract(c);
      setEmailTo(c.clientEmail);
      setEmailSubject(c.template?.emailSubject?.replace('{{contractId}}', String(c.id)) || `Contrato #${c.id}`);
      setEmailBody(c.template?.emailBody?.replace('{{clientName}}', c.clientName)?.replace('{{contractId}}', String(c.id)) || `Estimado(a) ${c.clientName},\n\nAdjuntamos el contrato #${c.id} para su revisión y firma.\n\nSaludos cordiales.`);
      getContractDocuments(cid).then(setDocuments).catch(() => setDocuments([]));
    } catch { navigate('/ventas/contratos'); }
  };

  const handleOpenDocument = async (filePath: string) => {
    try {
      const blob = await fetchProtectedFile(filePath);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      showToast('No se pudo abrir el archivo', 'error');
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      await generateContractPdf(+id);
      loadContract(+id);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al generar PDF', 'error');
    } finally { setGenerating(false); }
  };

  const handleGenerateClick = () => {
    if (contract?.status === 'SENT') { setPendingSentAction('generate'); return; }
    handleGenerate();
  };

  const handleEditFieldsClick = () => {
    if (contract?.status === 'SENT') { setPendingSentAction('edit'); return; }
    navigate(`/ventas/contratos/${contract!.id}/editar`);
  };

  const handleConfirmSentAction = () => {
    const action = pendingSentAction;
    setPendingSentAction(null);
    if (action === 'generate') handleGenerate();
    else if (action === 'edit') navigate(`/ventas/contratos/${contract!.id}/editar`);
  };

  const handleCheckStatus = async () => {
    if (!id) return;
    setCheckingStatus(true);
    try {
      const result = await getContractSignatureStatus(+id);
      setSignatureStatus(result);
      if (result.contractStatus === 'SIGNED' && contract?.status !== 'SIGNED') {
        showToast('¡El contrato ya está firmado!', 'success');
        loadContract(+id);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al consultar el estado', 'error');
    } finally { setCheckingStatus(false); }
  };

  const handleSend = async () => {
    if (!id) return;
    if (!emailTo.trim()) { showToast('El email del destinatario es requerido', 'error'); return; }
    setSending(true);
    try {
      await sendContract(+id);
      showToast('Correo enviado correctamente', 'success');
      loadContract(+id);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al enviar', 'error');
    } finally { setSending(false); }
  };

  // Respaldo manual: si el webhook de SignWell (document_completed) no está
  // configurado en este entorno, o el documento se firmó fuera del sistema,
  // quien reciba el PDF ya firmado lo sube aquí a mano.
  const handleUploadSigned = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingSigned(true);
    try {
      await uploadSignedContract(+id, file);
      showToast('PDF firmado subido correctamente', 'success');
      loadContract(+id);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al subir el PDF firmado', 'error');
    } finally { setUploadingSigned(false); }
  };

  if (!contract) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Cargando...</div>;

  const statusColors: Record<string, string> = {
    DRAFT: '#f59e0b', GENERATING: '#3b82f6', READY: '#10b981',
    SENT: '#8b5cf6', SIGNED: '#059669', CANCELLED: '#ef4444',
  };

  const clientFields = contract.template?.fields?.filter(f => f.isClientField) || [];
  const isReady = contract.status === 'READY';
  const isDraft = contract.status === 'DRAFT';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', gap: 14, flexShrink: 0 }}>
        <button className="cacao-back-btn" onClick={() => navigate('/ventas/contratos')}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <h2 style={subPageTitle}>Contrato {contract.contractNumber || `#${contract.id}`} — {contract.clientName}</h2>
        <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[contract.status] || '#888', color: '#fff', fontSize: 11, fontWeight: 600 }}>{contract.status}</span>
        <div style={{ flex: 1 }} />
        {contract.status !== 'SIGNED' && (
          <button className="btn-secondary" onClick={handleEditFieldsClick} style={{ padding: '10px 20px', fontSize: 13 }}>
            ✏️ Editar campos
          </button>
        )}
        {contract.status !== 'SIGNED' && (
          <button className="auth-btn" onClick={handleGenerateClick} disabled={generating} style={{ padding: '10px 20px', fontSize: 13 }}>
            {generating ? 'Generando PDF...' : contract.generatedPdfPath ? '🔄 Regenerar PDF' : '⚡ Generar PDF'}
          </button>
        )}
      </div>

      {pendingSentAction && (
        <ConfirmDialog
          title="Contrato ya enviado a firmar"
          message={SENT_WARNING}
          confirmLabel="Continuar de todas formas"
          danger
          onConfirm={handleConfirmSentAction}
          onCancel={() => setPendingSentAction(null)}
        />
      )}

      {contract.clientFillToken && (
        <div style={{ padding: '10px 24px', background: contract.clientFilledAt ? '#f0fdf4' : '#fffbeb', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {contract.clientFilledAt ? (
            <span style={{ fontSize: 13, color: '#166534' }}>✅ El cliente ya envió su información.</span>
          ) : (
            <>
              <span style={{ fontSize: 13, color: '#92400e' }}>El cliente todavía debe completar información antes de firmar.</span>
              <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => {
                  const url = `${window.location.origin}/ventas/contratos/completar/${contract.clientFillToken}`;
                  navigator.clipboard.writeText(url);
                  showToast('Link copiado al portapapeles', 'success');
                }}>
                📋 Copiar link para el cliente
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: PDF viewer */}
        <div style={{ flex: 1, overflow: 'auto', background: '#e8e8e8', display: 'flex', justifyContent: 'center', padding: 20 }}>
          {contract.generatedPdfPath ? (
            pdfObjectUrl ? (
              <iframe src={pdfObjectUrl} style={{ width: '100%', height: '100%', border: 'none', background: '#fff', minHeight: 600 }} title="PDF" />
            ) : (
              <div style={{ textAlign: 'center', padding: 80, color: '#888' }}>Cargando PDF...</div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: 80, color: '#888' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 14, marginBottom: 16 }}>El PDF aún no ha sido generado</div>
              {isDraft && (
                <button className="auth-btn" onClick={handleGenerate} disabled={generating} style={{ padding: '10px 24px', fontSize: 13 }}>
                  Generar PDF
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Email config */}
        <div style={{ width: 380, background: '#fff', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {/* Client fields — qué se le va a pedir al cliente, y cómo (antes o al firmar) */}
          {clientFields.length > 0 && (
            <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Información que se le pedirá al cliente</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Campo</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Cómo</th>
                  </tr>
                </thead>
                <tbody>
                  {clientFields.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px' }}>{f.label}</td>
                      <td style={{ padding: '4px 6px', color: '#888' }}>
                        {f.fieldType === 'TABLE' ? 'Por link, antes de firmar' : 'Dentro del documento, al firmar (SignWell)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Envío de correo</h3>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 2 }}>Para</label>
              <input value={emailTo} onChange={e => setEmailTo(e.target.value)} type="email"
                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 2 }}>Asunto</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 2 }}>Mensaje</label>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>

          {/* Estado de la firma en SignWell — a demanda, no hay polling automático */}
          {contract.signwellDocumentId && (
            <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Estado de la firma</h4>
                <button onClick={handleCheckStatus} disabled={checkingStatus}
                  style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                  {checkingStatus ? 'Consultando...' : '🔄 Actualizar'}
                </button>
              </div>
              <div style={{ fontSize: 12, marginBottom: signatureStatus ? 8 : 0 }}>
                {signatureStatus ? signwellStatusLabel(signatureStatus.status) : signwellStatusLabel(contract.signwellStatus || 'Sent')}
              </div>
              {signatureStatus && signatureStatus.recipients.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {signatureStatus.recipients.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '4px 6px' }}>{r.name || r.email || '—'}</td>
                        <td style={{ padding: '4px 6px', color: r.bounced ? '#c33' : '#888' }}>
                          {r.bounced ? `No entregado${r.bouncedDetails ? `: ${r.bouncedDetails}` : ''}` : (r.status ? signwellStatusLabel(r.status) : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Document history */}
          {documents.length > 0 && (
            <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Historial de documentos</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Fecha</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: '#888' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px' }}>{DOCUMENT_TYPE_LABELS[d.type] || d.type}</td>
                      <td style={{ padding: '4px 6px', color: '#888' }}>{new Date(d.createdAt).toLocaleString('es-EC')}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        <button onClick={() => handleOpenDocument(d.filePath)}
                          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 10 }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>

          {/* Send button — outside the scroll area so it's always reachable */}
          <div style={{ padding: 16, borderTop: '1px solid #eee', flexShrink: 0 }}>
            <button className="auth-btn" onClick={handleSend} disabled={sending || !isReady}
              style={{ width: '100%', padding: '10px', fontSize: 13, ...(isReady ? { background: '#059669' } : {}) }}>
              {sending ? 'Enviando...' : isReady ? '✉️ Enviar a Firma Electrónica (SignWell)' : 'Genera el PDF primero'}
            </button>
            {contract.status !== 'DRAFT' && contract.status !== 'SIGNED' && (
              <label className="btn-secondary" style={{ display: 'block', width: '100%', padding: '10px', fontSize: 13, textAlign: 'center', marginTop: 8, cursor: uploadingSigned ? 'default' : 'pointer', boxSizing: 'border-box' }}>
                {uploadingSigned ? 'Subiendo...' : '📤 Subir PDF firmado'}
                <input type="file" accept="application/pdf" onChange={handleUploadSigned} disabled={uploadingSigned} style={{ display: 'none' }} />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
