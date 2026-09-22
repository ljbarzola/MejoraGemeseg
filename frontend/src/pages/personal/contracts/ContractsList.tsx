import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FilePlus, FileText, FolderOpen } from 'lucide-react';
import { getContracts, getContractTemplates, deleteContractTemplate, resolveContractFileUrl, getDriveConfig, type ContractTemplate } from '../../../services/personal.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

export default function ContractsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contracts, setContracts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [confirmandoEliminarPlantilla, setConfirmandoEliminarPlantilla] = useState<number | null>(null);
  const [deleteTemplateError, setDeleteTemplateError] = useState('');
  // Carpeta de Drive donde quedan los documentos generados. Está fija en
  // código (RRHH_DOCUMENTOS), no se configura desde la app — pero sí se ofrece
  // el enlace para abrirla, que es lo que hace falta en el día a día.
  const [carpetaDriveUrl, setCarpetaDriveUrl] = useState<string | null>(null);
  const deleteTemplateErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDriveConfig('RRHH_DOCUMENTOS')
      .then((c: { driveFolderLink?: string } | null) => setCarpetaDriveUrl(c?.driveFolderLink || null))
      .catch(() => setCarpetaDriveUrl(null));
  }, []);

  useEffect(() => {
    if (deleteTemplateError) {
      deleteTemplateErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [deleteTemplateError]);

  const load = () => {
    setLoading(true);
    Promise.all([getContracts(), getContractTemplates()])
      .then(([c, t]) => { setContracts(c); setTemplates(t); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDeleteTemplate = (id: number) => {
    setDeleteTemplateError('');
    setConfirmandoEliminarPlantilla(id);
  };

  const confirmarEliminarPlantilla = async () => {
    const id = confirmandoEliminarPlantilla;
    if (id == null) return;
    setConfirmandoEliminarPlantilla(null);
    try {
      await deleteContractTemplate(id);
      load();
    } catch (err: any) {
      setDeleteTemplateError(err.response?.data?.message || 'No se pudo eliminar la plantilla.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Documentación</h1>
          </div>
          <div className="header-actions">
            {carpetaDriveUrl && (
              <a
                className="btn-secondary"
                href={carpetaDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir en Google Drive la carpeta donde se guardan los documentos generados"
              >
                <FolderOpen size={16} /> Ver carpeta
              </a>
            )}
            <button className="btn-secondary" onClick={() => navigate('/rrhh/contracts/generar')}>
              <FileText size={16} /> Generar documento
            </button>
            <button className="auth-btn" onClick={() => navigate('/rrhh/contracts/plantillas/nueva')}>
              <FilePlus size={16} /> Nueva plantilla
            </button>
          </div>
        </div>
      </div>

      {deleteTemplateError && (
        <div ref={deleteTemplateErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{deleteTemplateError}</div>
      )}

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

      {confirmandoEliminarPlantilla !== null && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message="¿Eliminar esta plantilla? Solo se puede si no tiene contratos generados."
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminarPlantilla}
          onCancel={() => setConfirmandoEliminarPlantilla(null)}
        />
      )}
    </div>
  );
}
