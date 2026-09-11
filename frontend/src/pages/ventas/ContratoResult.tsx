import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getContract, generateContractPdf, sendContract, getContractDocuments, fetchProtectedFile, SalesContract, SalesContractDocument } from '../../services/ventas.service';
import { subPageTitle } from './contratoStyles';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  GENERADO: 'PDF generado',
  ENVIADO: 'Enviado a firma',
};

export default function ContratoResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contract, setContract] = useState<SalesContract | null>(null);
  const [documents, setDocuments] = useState<SalesContractDocument[]>([]);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
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
      alert('No se pudo abrir el archivo');
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      await generateContractPdf(+id);
      loadContract(+id);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al generar PDF');
    } finally { setGenerating(false); }
  };

  const handleSend = async () => {
    if (!id) return;
    if (!emailTo.trim()) { alert('El email del destinatario es requerido'); return; }
    setSending(true);
    try {
      await sendContract(+id);
      alert('Correo enviado correctamente');
      loadContract(+id);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al enviar');
    } finally { setSending(false); }
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
        <h2 style={subPageTitle}>Contrato #{contract.id} — {contract.clientName}</h2>
        <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[contract.status] || '#888', color: '#fff', fontSize: 11, fontWeight: 600 }}>{contract.status}</span>
        <div style={{ flex: 1 }} />
        {isDraft && (
          <button className="auth-btn" onClick={handleGenerate} disabled={generating} style={{ padding: '10px 20px', fontSize: 13 }}>
            {generating ? 'Generando PDF...' : '⚡ Generar PDF'}
          </button>
        )}
      </div>

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

          {/* Client fields */}
          {clientFields.length > 0 && (
            <div style={{ padding: 16, borderBottom: '1px solid #eee', flex: 1, overflow: 'auto' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Campos que el cliente debe llenar</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Campo</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#888' }}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {clientFields.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px' }}>{f.label}</td>
                      <td style={{ padding: '4px 6px', color: '#888' }}>{f.fieldType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

          {/* Send button */}
          <div style={{ padding: 16 }}>
            <button className="auth-btn" onClick={handleSend} disabled={sending || !isReady}
              style={{ width: '100%', padding: '10px', fontSize: 13, ...(isReady ? { background: '#059669' } : {}) }}>
              {sending ? 'Enviando...' : isReady ? '✉️ Enviar Correo con BoldSign' : 'Genera el PDF primero'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
