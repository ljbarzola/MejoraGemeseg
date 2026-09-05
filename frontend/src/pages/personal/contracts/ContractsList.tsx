import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContracts, getContractTemplates, generateContract, updateContract, downloadContractPdf, downloadActaUniformes } from '../../../services/personal.service';
import { getCandidates } from '../../../services/personal.service';

const CONTRACT_STATUSES = ['DRAFT', 'GENERADO', 'FIRMADO', 'ANULADO'] as const;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: '#fefcbf', color: '#975a16' },
  GENERADO: { bg: '#bee3f8', color: '#2c5282' },
  FIRMADO: { bg: '#c6f6d5', color: '#276749' },
  ANULADO: { bg: '#fed7d7', color: '#c53030' },
};

export default function ContractsList() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([getContracts(), getContractTemplates(), getCandidates()])
      .then(([c, t, cand]) => { setContracts(c); setTemplates(t); setCandidates(cand); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    if (!selectedCandidate || !selectedTemplate) return;
    await generateContract({ candidateId: selectedCandidate, templateId: selectedTemplate });
    setShowGenerate(false);
    setSelectedCandidate(null);
    setSelectedTemplate(null);
    load();
  };

  // El backend responde el PDF como blob; lo abrimos como descarga del navegador.
  const download = async (fetcher: () => Promise<Blob>, filename: string, key: string) => {
    setBusyId(key);
    setError('');
    try {
      const blob = await fetcher();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo generar el documento.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    setBusyId(`status-${id}`);
    setError('');
    try {
      await updateContract(id, { status });
      load();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join('. ') : msg || 'No se pudo actualizar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>Contratos</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => setShowGenerate(true)}>+ Generar Contrato</button>
      </div>

      <div className="admin-section">
        <h3 style={{ marginBottom: '12px' }}>Plantillas Disponibles</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px', marginBottom: '24px' }}>
          {templates.length === 0 ? (
            <div style={{ color: '#718096', fontSize: '0.9rem' }}>No hay plantillas. Sube una plantilla DOCX para comenzar.</div>
          ) : templates.map((t) => (
            <div key={t.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '4px' }}>{t.type.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>

        <h3 style={{ marginBottom: '12px' }}>Contratos Generados</h3>
        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: '8px', padding: '10px 14px', fontSize: '0.82rem', marginBottom: '12px' }}>
            {error}
          </div>
        )}
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : contracts.length === 0 ? (
          <div className="empty-state">No hay contratos generados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Cédula</th>
                  <th>Plantilla</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Documentos</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const colors = STATUS_COLORS[c.status] || STATUS_COLORS.DRAFT;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.candidate?.fullName}</td>
                      <td style={{ fontFamily: 'monospace' }}>{c.candidate?.cedula}</td>
                      <td>{c.template?.name}</td>
                      <td>
                        <select
                          value={c.status}
                          disabled={busyId === `status-${c.id}`}
                          onChange={(e) => handleStatusChange(c.id, e.target.value)}
                          title="Cambiar estado del contrato"
                          style={{
                            backgroundColor: colors.bg, color: colors.color, border: 'none',
                            borderRadius: '12px', padding: '4px 10px', fontSize: '0.78rem',
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>{new Date(c.createdAt).toLocaleDateString('es-EC')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '8px 10px', whiteSpace: 'nowrap' }}
                            disabled={busyId === `pdf-${c.id}`}
                            onClick={() => download(
                              () => downloadContractPdf(c.id),
                              `contrato_${c.candidate?.cedula || c.id}.pdf`,
                              `pdf-${c.id}`,
                            )}
                          >
                            {busyId === `pdf-${c.id}` ? '...' : '📄 Contrato'}
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '8px 10px', whiteSpace: 'nowrap' }}
                            disabled={busyId === `acta-${c.id}`}
                            onClick={() => download(
                              () => downloadActaUniformes(c.id),
                              `acta_uniformes_${c.candidate?.cedula || c.id}.pdf`,
                              `acta-${c.id}`,
                            )}
                          >
                            {busyId === `acta-${c.id}` ? '...' : '👔 Acta uniformes'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showGenerate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '400px', maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: '16px' }}>Generar Contrato</h3>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Candidato</label>
              <select value={selectedCandidate || ''} onChange={e => setSelectedCandidate(+e.target.value)} className="form-input">
                <option value="">Seleccionar candidato</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.fullName} ({c.cedula})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Plantilla</label>
              <select value={selectedTemplate || ''} onChange={e => setSelectedTemplate(+e.target.value)} className="form-input">
                <option value="">Seleccionar plantilla</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowGenerate(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleGenerate} disabled={!selectedCandidate || !selectedTemplate}>Generar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
