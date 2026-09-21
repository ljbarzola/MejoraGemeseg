import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import {
  getPendingSurveys,
  getSurveyToRespond,
  submitSurveyResponse,
  type Survey,
} from '../../services/personal.service';

// Lado del destinatario: lista las encuestas pendientes asignadas a mí y
// permite responderlas — no requiere permiso de RRHH, cualquier empleado
// con cuenta puede tener encuestas pendientes.
export default function SurveysPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ id: number; title: string; description: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSurvey, setOpenSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [openError, setOpenError] = useState('');
  const openErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openError) {
      openErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [openError]);

  const load = () => {
    setLoading(true);
    getPendingSurveys().then(setPending).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openToAnswer = async (id: number) => {
    setError('');
    setOpenError('');
    try {
      const survey = await getSurveyToRespond(id);
      setOpenSurvey(survey);
      setAnswers({});
    } catch (err: any) {
      setOpenError(err.response?.data?.message || 'No se pudo abrir la encuesta.');
    }
  };

  const setAnswer = (questionId: number, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiOption = (questionId: number, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [questionId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!openSurvey) return;
    const questions = openSurvey.questions || [];
    const missing = questions.filter((q) => {
      if (!q.required) return false;
      const a = answers[q.id];
      return !a || (Array.isArray(a) && a.length === 0) || (typeof a === 'string' && !a.trim());
    });
    if (missing.length > 0) {
      setError(`Faltan preguntas obligatorias: ${missing.map((q) => q.label).join(', ')}`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await submitSurveyResponse(
        openSurvey.id,
        questions.map((q) => {
          const a = answers[q.id];
          return Array.isArray(a)
            ? { questionId: q.id, valueJson: a }
            : { questionId: q.id, valueText: a || undefined };
        }),
      );
      setOpenSurvey(null);
      setDoneMsg('¡Gracias! Tu respuesta fue registrada.');
      setTimeout(() => setDoneMsg(''), 5000);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo enviar tu respuesta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-state">Cargando encuestas...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/dashboard')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div>
          <p className="page-eyebrow">RECURSOS HUMANOS</p>
          <h1>Encuestas</h1>
        </div>
      </div>

      {doneMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>
          {doneMsg}
        </div>
      )}

      {openError && (
        <div ref={openErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>
          {openError}
        </div>
      )}

      <div className="admin-section" style={{ maxWidth: '640px' }}>
        <h3 style={{ marginBottom: '12px', color: 'var(--azul-oscuro)' }}>Pendientes por responder</h3>
        {pending.length === 0 ? (
          <div className="empty-state">No tienes encuestas pendientes.</div>
        ) : (
          pending.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{s.title}</div>
                {s.description && <div style={{ fontSize: '0.78rem', color: '#718096' }}>{s.description}</div>}
              </div>
              <button className="auth-btn" onClick={() => openToAnswer(s.id)}>Responder</button>
            </div>
          ))
        )}
      </div>

      {openSurvey && (
        <div className="modal-overlay" onClick={() => setOpenSurvey(null)}>
          <div className="modal modal-lg" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{openSurvey.title}</h3>
            </div>
            <div className="modal-body">
              {openSurvey.description && <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '14px' }}>{openSurvey.description}</p>}
              {error && <div className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}

              {(openSurvey.questions || []).map((q) => (
                <div className="form-group" key={q.id}>
                  <label>{q.label}{q.required ? ' *' : ''}</label>

                  {q.type === 'SHORT_TEXT' && (
                    <input type="text" value={(answers[q.id] as string) || ''} onChange={(e) => setAnswer(q.id, e.target.value)} />
                  )}
                  {q.type === 'LONG_TEXT' && (
                    <textarea rows={3} value={(answers[q.id] as string) || ''} onChange={(e) => setAnswer(q.id, e.target.value)} />
                  )}
                  {q.type === 'SINGLE_CHOICE' && (
                    <div>
                      {(q.options || []).map((opt) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '4px 0', cursor: 'pointer' }}>
                          <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === 'MULTIPLE_CHOICE' && (
                    <div>
                      {(q.options || []).map((opt) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '4px 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)}
                            onChange={() => toggleMultiOption(q.id, opt)}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === 'RATING' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          type="button"
                          key={n}
                          onClick={() => setAnswer(q.id, String(n))}
                          className={answers[q.id] === String(n) ? 'auth-btn' : 'btn-secondary'}
                          style={{ width: '38px', height: '38px', padding: 0 }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setOpenSurvey(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleSubmit} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Send size={15} /> {submitting ? 'Enviando...' : 'Enviar respuesta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
