import { useState, useEffect, useRef } from 'react';
import { Send, Eye, EyeOff, MessageSquareText, Handshake, CircleCheckBig } from 'lucide-react';
import { createComplaint, getComplaintFields, type ComplaintFieldDefinition } from '../../services/personal.service';
import PageHeader from '../../components/common/PageHeader';

// Pantalla de envío únicamente — accesible a cualquier empleado autenticado
// (ver App.tsx, esta ruta no exige el permiso de sección RRHH). No muestra
// un historial de "mis quejas": mezclar eso con la opción de anonimato no
// tiene sentido (si se puede enviar anónima, no puede haber un registro
// "mío" consistente). La gestión (ver todas, mover de etapa) vive aparte en
// ComplaintsManagementPage.tsx, dentro del submódulo RRHH.
export default function ComplaintsPage() {

  const [fields, setFields] = useState<ComplaintFieldDefinition[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getComplaintFields().then(setFields).catch(() => {});
  }, []);

  // Si la persona ya bajó hasta «Enviar», un error pintado arriba pasaba desapercibido.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

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
      <PageHeader
        eyebrow="Recursos Humanos"
        title="Buzón de Quejas y Sugerencias"
        description="Cuéntanos lo que no está funcionando o lo que se puede mejorar. Puedes enviarlo identificado o de forma anónima."
      />

      <div className="buzon-layout">
        <div className="admin-section buzon-form">
          <h3 className="buzon-title">Enviar una queja o sugerencia</h3>

          {error && <div ref={errorRef} className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}
          {sentMsg && (
            <div className="buzon-ok" role="status">
              <CircleCheckBig size={16} /> {sentMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Descripción *</label>
              <textarea value={description} onChange={(e) => { setDescription(e.target.value); if (error) setError(''); }} rows={6} placeholder="Describe la situación..." />
              <small style={{ color: description.trim().length >= 5 ? '#718096' : '#c53030' }}>
                {description.trim().length < 5
                  ? 'Describe la situación con al menos 5 caracteres.'
                  : 'Listo para enviar.'}
              </small>
            </div>

            {fields.length > 0 && (
              <div className="buzon-campos">
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
              </div>
            )}

            <label className={`buzon-anonimo ${isAnonymous ? 'buzon-anonimo--on' : ''}`}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              {isAnonymous ? <EyeOff size={18} /> : <Eye size={18} />}
              <span>
                <strong>Enviar de forma anónima</strong>
                <small>{isAnonymous ? 'RRHH recibirá tu mensaje sin tu nombre.' : 'Se enviará con tu nombre.'}</small>
              </span>
            </label>

            <button
              className="auth-btn"
              onClick={handleSubmit}
              disabled={sending || description.trim().length < 5}
              title={description.trim().length < 5 ? 'Describe la situación con al menos 5 caracteres.' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start' }}
            >
              <Send size={15} /> {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>

        <aside className="admin-section buzon-info">
          <h3 className="buzon-title">¿Qué pasa con tu mensaje?</h3>
          <p className="buzon-info-intro">
            Tu queja o sugerencia la trabaja el equipo de RRHH en tres etapas:
          </p>
          <ol className="buzon-pasos">
            <li>
              <span className="buzon-paso-icono"><MessageSquareText size={16} /></span>
              <span><strong>Sensibilización</strong></span>
            </li>
            <li>
              <span className="buzon-paso-icono"><Handshake size={16} /></span>
              <span><strong>Comunicación</strong></span>
            </li>
            <li>
              <span className="buzon-paso-icono"><CircleCheckBig size={16} /></span>
              <span><strong>Solución</strong></span>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
