import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getSurveyResults,
  getSurveyIndividualResults,
  type SurveyResults,
  type SurveyIndividualResults,
  type SurveyIndividualResponse,
} from '../../services/personal.service';

interface Props {
  surveyId: number;
  onClose: () => void;
}

function formatAnswerValue(answer: { valueText: string | null; valueJson: unknown; questionId: number }, questionType: string): string {
  if (questionType === 'MULTIPLE_CHOICE' && Array.isArray(answer.valueJson)) {
    return (answer.valueJson as string[]).join(', ');
  }
  if (questionType === 'SINGLE_CHOICE') {
    return answer.valueText || '';
  }
  if (questionType === 'RATING') {
    return answer.valueText ? `${answer.valueText} / 5` : '';
  }
  return answer.valueText || '';
}

function IndividualResponseCard({ response, questions }: { response: SurveyIndividualResponse; questions: SurveyIndividualResults['questions'] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '10px 12px', border: 'none', background: expanded ? '#f7fafc' : '#fff',
          cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <strong style={{ color: 'var(--azul-oscuro)' }}>{response.respondentName}</strong>
        <span style={{ color: '#718096', fontSize: '0.78rem' }}>{response.respondentEmail}</span>
        <span style={{ color: '#a0aec0', fontSize: '0.75rem', marginLeft: 'auto' }}>
          {new Date(response.submittedAt).toLocaleString('es-EC')}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f7fafc' }}>
          {questions.map((q) => {
            const answer = response.answers.find((a) => a.questionId === q.questionId);
            return (
              <div key={q.questionId} style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '0.78rem', color: '#718096', margin: '0 0 2px' }}>{q.label}</p>
                <p style={{ fontSize: '0.85rem', color: '#2d3748', margin: 0, fontWeight: 500 }}>
                  {answer ? formatAnswerValue(answer, q.type) : <em style={{ color: '#a0aec0' }}>Sin respuesta</em>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SurveyResultsModal({ surveyId, onClose }: Props) {
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [individualResults, setIndividualResults] = useState<SurveyIndividualResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'aggregated' | 'individual'>('aggregated');

  useEffect(() => {
    setLoading(true);
    getSurveyResults(surveyId).then(setResults).finally(() => setLoading(false));
  }, [surveyId]);

  const loadIndividual = () => {
    if (individualResults) return;
    getSurveyIndividualResults(surveyId).then(setIndividualResults).catch(() => {});
  };

  const handleViewModeChange = (mode: 'aggregated' | 'individual') => {
    setViewMode(mode);
    if (mode === 'individual') loadIndividual();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Resultados{results ? `: ${results.title}` : ''}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {loading || !results ? (
            <div className="loading-state">Cargando resultados...</div>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '12px' }}>
                <strong>{results.totalResponses}</strong> de <strong>{results.totalRecipients}</strong> destinatario(s) respondieron
                {results.totalRecipients > 0 && ` (${Math.round((results.totalResponses / results.totalRecipients) * 100)}%)`}.
              </p>

              {/* Toggle de vista */}
              <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '18px' }}>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('aggregated')}
                  style={{
                    flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 600,
                    background: viewMode === 'aggregated' ? 'var(--azul-oscuro)' : '#fff',
                    color: viewMode === 'aggregated' ? '#fff' : '#4a5568',
                  }}
                >
                  Resumen
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('individual')}
                  style={{
                    flex: 1, padding: '8px 12px', border: 'none', borderLeft: '1px solid #e2e8f0',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    background: viewMode === 'individual' ? 'var(--azul-oscuro)' : '#fff',
                    color: viewMode === 'individual' ? '#fff' : '#4a5568',
                  }}
                >
                  Por persona
                </button>
              </div>

              {/* Vista agregada */}
              {viewMode === 'aggregated' && results.questions.map((q) => (
                <div key={q.questionId} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>
                    {q.label} <span style={{ fontWeight: 400, color: '#a0aec0', fontSize: '0.78rem' }}>({q.responseCount} respuesta{q.responseCount === 1 ? '' : 's'})</span>
                  </p>

                  {q.counts && (
                    <div>
                      {Object.entries(q.counts).map(([opt, count]) => {
                        const max = Math.max(1, ...Object.values(q.counts!));
                        return (
                          <div key={opt} style={{ marginBottom: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                              <span>{opt}</span>
                              <span style={{ color: '#718096' }}>{count}</span>
                            </div>
                            <div style={{ background: '#f1f5f9', borderRadius: '4px', height: '8px' }}>
                              <div style={{ width: `${(count / max) * 100}%`, background: '#2b6cb0', height: '100%', borderRadius: '4px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.average !== undefined && (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 6px' }}>
                        Promedio: <strong>{q.average !== null ? q.average.toFixed(1) : '—'}</strong> / 5
                      </p>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div key={n} style={{ textAlign: 'center', fontSize: '0.72rem', color: '#718096' }}>
                            <div>{n}</div>
                            <div>{q.distribution?.[n] || 0}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.textAnswers && (
                    q.textAnswers.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Sin respuestas todavía.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {q.textAnswers.map((a, i) => (
                          <div key={i} style={{ fontSize: '0.82rem', color: '#4a5568', background: '#f7fafc', borderRadius: '6px', padding: '6px 10px' }}>{a}</div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ))}

              {/* Vista individual */}
              {viewMode === 'individual' && (
                <>
                  {!individualResults ? (
                    <div className="loading-state">Cargando respuestas individuales...</div>
                  ) : individualResults.responses.length === 0 ? (
                    <div className="empty-state">Aún no hay respuestas registradas.</div>
                  ) : (
                    <div>
                      {individualResults.responses.map((r) => (
                        <IndividualResponseCard key={r.respondentId} response={r} questions={individualResults.questions} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
