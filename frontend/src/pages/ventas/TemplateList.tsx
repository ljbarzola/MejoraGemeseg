import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, deleteTemplate, SalesTemplate } from '../../services/ventas.service';

export default function TemplateList() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalesTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try { setTemplates(await getTemplates()); } catch { /* */ } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try { await deleteTemplate(id); loadTemplates(); } catch { /* */ }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Plantillas de Contrato</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.875rem' }}>Documentos base con campos editables para generar contratos</p>
        </div>
        <button onClick={() => navigate('/ventas/contratos/plantillas/nueva')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#100F31', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          + Nueva Plantilla
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Cargando...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
          <div>No hay plantillas creadas</div>
          <button onClick={() => navigate('/ventas/contratos/plantillas/nueva')} style={{ marginTop: '16px', padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#100F31', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Crear plantilla</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {templates.map((t) => (
            <div key={t.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ height: '8px', background: t.boldsignTemplateId ? '#059669' : '#f59e0b' }} />
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>{t.name}</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>{t.description || 'Sin descripción'}</p>
                  </div>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: t.boldsignTemplateId ? '#d1fae5' : '#fef3c7', color: t.boldsignTemplateId ? '#065f46' : '#92400e' }}>
                    {t.boldsignTemplateId ? 'Sync' : 'Local'}
                  </span>
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
                  <button onClick={() => navigate(`/ventas/contratos/plantillas/${t.id}`)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => handleDelete(t.id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
