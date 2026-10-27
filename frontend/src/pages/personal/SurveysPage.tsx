import { useState, useEffect, useRef } from 'react';
import { Send, ClipboardList, ArrowRight, PartyPopper } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
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
      <PageHeader
        eyebrow="Recursos Humanos"
        title="Encuestas"
        description="Las encuestas que RRHH te asignó y aún no has respondido."
      />

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

      {pending.length === 0 ? (
        <div className="admin-section encuestas-vacio">
          <PartyPopper size={34} />
          <strong>No tienes encuestas pendientes</strong>
          <span>Cuando RRHH te asigne una, aparecerá aquí.</span>
        </div>
      ) : (
        <>
          <div className="encuestas-contador">{pending.length} pendiente{pending.length === 1 ? '' : 's'} por responder</div>
          <div className="encuestas-grid">
            {pending.map((s) => (
              <div key={s.id} className="encuesta-card">
                <span className="encuesta-card-icono"><ClipboardList size={18} /></span>
                <div className="encuesta-card-texto">
                  <div className="encuesta-card-titulo">{s.title}</div>
                  {s.description && <div className="encuesta-card-desc">{s.description}</div>}
                </div>
                <button className="auth-btn" onClick={() => openToAnswer(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Responder <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

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
