import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { createComplaint, getComplaintFields, type ComplaintFieldDefinition } from '../../services/personal.service';

// Pantalla de envío únicamente — accesible a cualquier empleado autenticado
// (ver App.tsx, esta ruta no exige el permiso de sección RRHH). No muestra
// un historial de "mis quejas": mezclar eso con la opción de anonimato no
// tiene sentido (si se puede enviar anónima, no puede haber un registro
// "mío" consistente). La gestión (ver todas, mover de etapa) vive aparte en
// ComplaintsManagementPage.tsx, dentro del submódulo RRHH.
export default function ComplaintsPage() {
  const navigate = useNavigate();

  const [fields, setFields] = useState<ComplaintFieldDefinition[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getComplaintFields().then(setFields).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (description.trim().length < 5) { setError('Describe la situación con al menos 5 caracteres.'); return; }
    const missing = fields.filter((f) => f.required && !fieldValues[String(f.id)]?.trim());
    if (missing.length > 0) { setError(`Faltan campos requeridos: ${missing.map((f) => f.label).join(', ')}`); return; }
    setError('');
    setSending(true);
    try {
      await createComplaint({ description: description.trim(), isAnonymous, customFieldValues: fieldValues });
      setDescription('');
      setIsAnonymous(false);
      setFieldValues({});
      setSentMsg('Tu queja o sugerencia fue enviada. El equipo de RRHH la revisará.');
      setTimeout(() => setSentMsg(''), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo enviar tu queja o sugerencia.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/dashboard')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div>
          <p className="page-eyebrow">RECURSOS HUMANOS</p>
          <h1>Buzón de Quejas y Sugerencias</h1>
        </div>
      </div>

      <div className="admin-section" style={{ maxWidth: '640px' }}>
        <h3 style={{ marginBottom: '12px', color: 'var(--azul-oscuro)' }}>Enviar una queja o sugerencia</h3>
        <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '14px' }}>
          Tu queja o sugerencia pasa por un proceso de sensibilización, comunicación y solución con el equipo de RRHH. Puedes enviarla identificada o de forma anónima.
        </p>

        {error && <div className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}
        {sentMsg && (
          <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem' }}>
            {sentMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>Descripción *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe la situación..." />
          </div>

          {fields.map((f) => (
            <div className="form-group" key={f.id}>
              <label>{f.label}{f.required ? ' *' : ''}</label>
              <input
                type={f.type === 'DATE' ? 'date' : f.type === 'NUMBER' ? 'number' : 'text'}
                value={fieldValues[String(f.id)] || ''}
                onChange={(e) => setFieldValues({ ...fieldValues, [String(f.id)]: e.target.value })}
              />
            </div>
          ))}

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              Enviar de forma anónima
            </label>
          </div>
          <button className="auth-btn" onClick={handleSubmit} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start' }}>
            <Send size={15} /> {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
