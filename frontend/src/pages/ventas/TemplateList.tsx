import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { getTemplates, deleteTemplate, SalesTemplate } from '../../services/ventas.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

export default function TemplateList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<SalesTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      setTemplates(await getTemplates());
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar las plantillas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const confirmarEliminar = async () => {
    if (confirmDeleteId == null) return;
    const id = confirmDeleteId;
    const template = templates.find((t) => t.id === id);
    setConfirmDeleteId(null);
    try {
      await deleteTemplate(id);
      loadTemplates();
    } catch (err: any) {
      const backendMessage = err?.response?.data?.message;
      const contractCount = template?._count?.contracts ?? 0;
      setBlockedDeleteMessage(
        backendMessage
          ? `${backendMessage}${contractCount > 0 ? ` (${contractCount} contrato${contractCount === 1 ? '' : 's'} vinculado${contractCount === 1 ? '' : 's'})` : ''}. Elimina o reasigna primero esos contratos para poder borrar la plantilla.`
          : 'No se pudo eliminar la plantilla. Intenta de nuevo más tarde.',
      );
    }
  };

  return (
    <div className="page-container">
      <button className="cacao-back-btn" onClick={() => navigate('/ventas/contratos')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} strokeWidth={2.4} /> Volver
      </button>

      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Plantillas de Contrato</h1>
        </div>
        <div className="header-actions">
          <button className="auth-btn" onClick={() => navigate('/ventas/contratos/configuracion')}>
            <Plus size={16} /> Nueva plantilla
          </button>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : templates.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
            <div>No hay plantillas creadas</div>
            <button className="auth-btn" onClick={() => navigate('/ventas/contratos/configuracion')} style={{ marginTop: '16px', padding: '10px 24px' }}>Crear plantilla</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {templates.map((t) => (
              <div key={t.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '20px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>{t.name}</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>{t.description || 'Sin descripción'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
                    <span>📄 {t.driveUrl ? 'Con Drive' : 'Sin Drive'}</span>
                    <span>📑 {t.docxPath ? 'Docx descargado' : 'Sin docx'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                    <span>🔲 {t._count?.fields || 0} campos</span>
                    <span>📝 {t._count?.contracts || 0} contratos</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button className="btn-secondary" onClick={() => navigate(`/ventas/contratos/configuracion/${t.id}`)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', fontSize: '0.8rem' }}>
                      <Pencil size={14} /> Editar
                    </button>
                    <button onClick={() => handleDelete(t.id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDeleteId != null && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message="¿Eliminar esta plantilla?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {blockedDeleteMessage != null && (
        <ConfirmDialog
          title="No se puede eliminar la plantilla"
          message={blockedDeleteMessage}
          confirmLabel="Entendido"
          hideCancel
          onConfirm={() => setBlockedDeleteMessage(null)}
          onCancel={() => setBlockedDeleteMessage(null)}
        />
      )}
    </div>
  );
}
