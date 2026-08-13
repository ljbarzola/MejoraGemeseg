import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLogTemplates, createLogTemplate, getLogEntries, createLogEntry, deleteLogEntry } from '../../../services/personal.service';

const LOG_TYPES = [
  { value: 'PERMISO_INGRESO', label: 'Permiso de Ingreso' },
  { value: 'RESPUESTA_ADMIN_CONTRATO', label: 'Respuesta a Admin de Contrato' },
  { value: 'NOVEDAD_OPERATIVA', label: 'Novedad Operativa' },
  { value: 'SALIDA_PERSONAL', label: 'Salida de Personal' },
];

const TYPE_COLORS: Record<string, string> = {
  PERMISO_INGRESO: '#2b6cb0',
  RESPUESTA_ADMIN_CONTRATO: '#6b46c1',
  NOVEDAD_OPERATIVA: '#b7791f',
  SALIDA_PERSONAL: '#c53030',
};

export default function LogEntries() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', type: LOG_TYPES[0].value, content: '' });
  const [entryForm, setEntryForm] = useState({ title: '', content: '', type: LOG_TYPES[0].value, templateId: '' });
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([getLogTemplates(), getLogEntries()])
      .then(([t, e]) => { setTemplates(t); setEntries(e); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) { setError('Nombre y contenido son requeridos'); return; }
    setError('');
    await createLogTemplate(templateForm);
    setShowNewTemplate(false);
    setTemplateForm({ name: '', type: LOG_TYPES[0].value, content: '' });
    load();
  };

  const handleCreateEntry = async () => {
    if (!entryForm.title.trim() || !entryForm.content.trim()) { setError('Título y contenido son requeridos'); return; }
    setError('');
    const payload: any = { ...entryForm };
    if (entryForm.templateId) payload.templateId = +entryForm.templateId;
    await createLogEntry(payload);
    setShowNewEntry(false);
    setEntryForm({ title: '', content: '', type: LOG_TYPES[0].value, templateId: '' });
    load();
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>Bitácoras e Informes</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={() => setShowNewTemplate(true)}>+ Plantilla</button>
          <button className="auth-btn" onClick={() => setShowNewEntry(true)}>+ Registro</button>
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>Plantillas</h3>
        {templates.length === 0 ? (
          <div style={{ color: '#718096', fontSize: '0.9rem' }}>No hay plantillas creadas.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {templates.map((t) => (
              <div key={t.id} style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${TYPE_COLORS[t.type] || '#718096'}` }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '2px' }}>{t.type.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section">
        <h3 style={{ marginBottom: '12px' }}>Registros</h3>
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">No hay registros de bitácora.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Plantilla</th>
                  <th>Fecha</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.title}</td>
                    <td>
                      <span className="status-badge" style={{
                        backgroundColor: (TYPE_COLORS[e.type] || '#718096') + '20',
                        color: TYPE_COLORS[e.type] || '#718096',
                      }}>
                        {e.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{e.template?.name || '—'}</td>
                    <td>{new Date(e.createdAt).toLocaleDateString('es-EC')}</td>
                    <td className="no-print">
                      <button className="btn-danger-sm" onClick={async () => { await deleteLogEntry(e.id); load(); }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewTemplate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '450px', maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: '16px' }}>Nueva Plantilla</h3>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Nombre *</label>
              <input value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="Nombre de la plantilla" />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Tipo *</label>
              <select value={templateForm.type} onChange={e => setTemplateForm({ ...templateForm, type: e.target.value })}>
                {LOG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Contenido *</label>
              <textarea value={templateForm.content} onChange={e => setTemplateForm({ ...templateForm, content: e.target.value })} rows={5} placeholder="Contenido de la plantilla..." style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowNewTemplate(false); setError(''); }}>Cancelar</button>
              <button className="auth-btn" onClick={handleCreateTemplate}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {showNewEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '450px', maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: '16px' }}>Nuevo Registro</h3>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Título *</label>
              <input value={entryForm.title} onChange={e => setEntryForm({ ...entryForm, title: e.target.value })} placeholder="Título del registro" />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Tipo *</label>
              <select value={entryForm.type} onChange={e => setEntryForm({ ...entryForm, type: e.target.value })}>
                {LOG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Plantilla (opcional)</label>
              <select value={entryForm.templateId} onChange={e => setEntryForm({ ...entryForm, templateId: e.target.value })}>
                <option value="">Sin plantilla</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Contenido *</label>
              <textarea value={entryForm.content} onChange={e => setEntryForm({ ...entryForm, content: e.target.value })} rows={5} placeholder="Descripción del registro..." style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowNewEntry(false); setError(''); }}>Cancelar</button>
              <button className="auth-btn" onClick={handleCreateEntry}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
