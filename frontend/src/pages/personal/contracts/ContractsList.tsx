import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FilePlus, FileText } from 'lucide-react';
import { getContracts, getContractTemplates, deleteContractTemplate, resolveContractFileUrl, type ContractTemplate } from '../../../services/personal.service';

export default function ContractsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contracts, setContracts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([getContracts(), getContractTemplates()])
      .then(([c, t]) => { setContracts(c); setTemplates(t); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('¿Eliminar esta plantilla? Solo se puede si no tiene contratos generados.')) return;
    try {
      await deleteContractTemplate(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo eliminar la plantilla.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Documentación</h1>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => navigate('/rrhh/contracts/generar')}>
              <FileText size={16} /> Generar Documento
            </button>
            <button className="btn-secondary" onClick={() => navigate('/rrhh/contracts/plantillas/nueva')}>
              <FilePlus size={16} /> Nueva Plantilla
            </button>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h3 style={{ marginBottom: '12px' }}>Plantillas</h3>
        <p style={{ fontSize: '0.85rem', color: '#718096', margin: '0 0 12px' }}>
          Modelos de documento (contratos, actas, etc.) usados para "Generar Documento" — elige un guardia y uno de estos tipos.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {templates.length === 0 ? (
            <div style={{ color: '#718096', fontSize: '0.9rem' }}>No hay plantillas todavía. Crea una para empezar.</div>
          ) : templates.map((t) => (
            <div key={t.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#718096', margin: '4px 0 10px' }}>{t.type}</div>
              <div style={{ fontSize: '0.78rem', marginBottom: '10px' }}>
                {t.docxPath ? (
                  <span style={{ color: '#276749' }}>✓ Documento cargado{t.fields?.length ? ` · ${t.fields.length} campo(s)` : ''}</span>
                ) : (
                  <span style={{ color: '#c53030' }}>⚠ Falta cargar el documento</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => navigate(`/rrhh/contracts/plantillas/${t.id}`)}>Configurar</button>
                <button className="btn-secondary" style={{ padding: '6px 10px', color: '#c53030' }} onClick={() => handleDeleteTemplate(t.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ marginBottom: '12px' }}>Documentos Generados</h3>
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : contracts.length === 0 ? (
          <div className="empty-state">No hay documentos generados todavía.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guardia</th>
                  <th>Cédula</th>
                  <th>Plantilla</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nombreGuardia}</td>
                    <td style={{ fontFamily: 'monospace' }}>{c.cedula}</td>
                    <td>{c.template?.name}</td>
                    <td>
                      <span className="status-badge" style={{
                        backgroundColor: c.status === 'DRAFT' ? '#fefcbf' : '#c6f6d5',
                        color: c.status === 'DRAFT' ? '#975a16' : '#276749',
                      }}>
                        {c.status}
                      </span>
                    </td>
                    <td>{new Date(c.createdAt).toLocaleDateString('es-EC')}</td>
                    <td>
                      {c.generatedUrl && (
                        <a href={resolveContractFileUrl(c.generatedUrl)} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
