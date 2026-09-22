import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPublicSurvey,
  submitPublicSurveyResponse,
  type PublicSurvey,
} from '../../services/publicSurvey.service';

/**
 * Formulario público de una encuesta. Es la ÚNICA pantalla de la app que se
 * abre sin iniciar sesión: la responde gente que no tiene cuenta (proveedores,
 * clientes, postulantes) desde el enlace que RRHH les comparte, incluido el
 * celular. Por eso no va dentro de ProtectedLayout ni de SectionRoute, y no
 * usa nada del contexto de sesión ni de permisos.
 */
export default function PublicSurveyPage() {
  const { token = '' } = useParams<{ token: string }>();

  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    getPublicSurvey(token)
      .then(setSurvey)
      .catch((err: any) =>
        setLoadError(
          err.response?.data?.message ||
            'No pudimos abrir esta encuesta. Revisa el enlace o pide uno nuevo a quien te lo compartió.',
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  // El error puede quedar fuera de pantalla en un formulario largo, sobre todo
  // en celular.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const setAnswer = (questionId: number, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const toggleMultiOption = (questionId: number, option: string) =>
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: next };
    });

  const handleSubmit = async () => {
    if (!survey) return;
    const missing = survey.questions.filter((q) => {
      if (!q.required) return false;
      const a = answers[q.id];
      return (
        !a ||
        (Array.isArray(a) && a.length === 0) ||
        (typeof a === 'string' && !a.trim())
      );
    });
    if (missing.length > 0) {
      setError(`Faltan preguntas obligatorias: ${missing.map((q) => q.label).join(', ')}`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await submitPublicSurveyResponse(
        token,
        survey.questions.map((q) => {
          const a = answers[q.id];
          return Array.isArray(a)
            ? { questionId: q.id, valueJson: a }
            : { questionId: q.id, valueText: a || undefined };
        }),
      );
      setEnviada(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo enviar tu respuesta. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const wrapper: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f7fafc',
    padding: '24px 16px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  };
  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: '24px 20px',
    width: '100%',
    maxWidth: 640,
    boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
  };

  if (loading) {
    return (
      <div style={wrapper}>
        <div style={card}>Cargando encuesta...</div>
      </div>
    );
  }

  if (loadError || !survey) {
    return (
      <div style={wrapper}>
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem', color: '#1a202c' }}>Encuesta no disponible</h2>
          <p style={{ color: '#718096', fontSize: '0.9rem', margin: 0 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (enviada) {
    return (
      <div style={wrapper}>
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ color: '#276749', fontWeight: 700, fontSize: '1.05rem', margin: '8px 0 6px' }}>
            ¡Gracias! Tu respuesta fue registrada.
          </p>
          <p style={{ color: '#718096', fontSize: '0.85rem', margin: 0 }}>Ya puedes cerrar esta página.</p>
        </div>
      </div>
    );
  }

  if (survey.cerrada) {
    return (
      <div style={wrapper}>
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem', color: '#1a202c' }}>{survey.title}</h2>
          <p style={{ color: '#718096', fontSize: '0.9rem', margin: 0 }}>
            Esta encuesta ya está cerrada y no acepta más respuestas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapper}>
      <div style={card}>
        <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1a202c' }}>{survey.title}</h2>
        {survey.description && (
          <p style={{ color: '#718096', fontSize: '0.88rem', marginTop: 4 }}>{survey.description}</p>
        )}
        <p style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: 4 }}>
          No necesitas cuenta ni iniciar sesión para responder.
        </p>

        {error && (
          <div
            ref={errorRef}
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              borderRadius: 8,
              padding: '10px 14px',
              margin: '14px 0',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {survey.questions.map((q) => (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  color: '#2d3748',
                  marginBottom: 6,
                }}
              >
                {q.label}
                {q.required && <span style={{ color: '#c53030' }}> *</span>}
              </label>

              {q.type === 'SHORT_TEXT' && (
                <input
                  type="text"
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  style={inputStyle}
                />
              )}
              {q.type === 'LONG_TEXT' && (
                <textarea
                  rows={3}
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  style={inputStyle}
                />
              )}
              {q.type === 'SINGLE_CHOICE' &&
                q.options.map((opt) => (
                  <label key={opt} style={optionStyle}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                    />
                    {opt}
                  </label>
                ))}
              {q.type === 'MULTIPLE_CHOICE' &&
                q.options.map((opt) => (
                  <label key={opt} style={optionStyle}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)}
                      onChange={() => toggleMultiOption(q.id, opt)}
                    />
                    {opt}
                  </label>
                ))}
              {q.type === 'RATING' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const activa = answers[q.id] === String(n);
                    return (
                      <button
                        type="button"
                        key={n}
                        onClick={() => setAnswer(q.id, String(n))}
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: `1px solid ${activa ? '#12375f' : '#e2e8f0'}`,
                          background: activa ? '#12375f' : '#fff',
                          color: activa ? '#fff' : '#4a5568',
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            background: '#12375f',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.92rem',
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Enviando...' : 'Enviar respuesta'}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const optionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.88rem',
  padding: '5px 0',
  cursor: 'pointer',
  color: '#2d3748',
};
