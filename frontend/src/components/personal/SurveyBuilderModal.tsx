import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { getUsers, type AdminUser } from '../../services/user.service';
import {
  createSurvey,
  SURVEY_QUESTION_TYPES,
  type SurveyQuestionInput,
  type SurveyQuestionType,
} from '../../services/personal.service';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_QUESTION: SurveyQuestionInput = { label: '', type: 'SHORT_TEXT', required: true, options: [] };

// Constructor de encuestas: RRHH arma preguntas dinámicas y elige por dónde
// enviarla — se crea y se publica en un solo paso (sin borrador editable por
// separado, para no complicar el flujo).
//
// Dos canales, que se pueden combinar en la misma encuesta:
//  - Destinatarios de la app: la reciben en "Mis Encuestas" y responden una
//    sola vez, identificados.
//  - Enlace público: una URL que cualquiera abre sin cuenta ni login. Si RRHH
//    quiere saber quién respondió, lo agrega como una pregunta más.
// Debe quedar activo al menos uno; si no, la encuesta no le llegaría a nadie.
export default function SurveyBuilderModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestionInput[]>([{ ...EMPTY_QUESTION }]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  // Qué botón se pulsó, para mostrar el texto correcto mientras guarda.
  const [guardandoComo, setGuardandoComo] = useState<'BORRADOR' | 'PUBLICAR' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getUsers({ isActive: 'true' }).then(setUsers).finally(() => setLoadingUsers(false));
  }, []);

  const updateQuestion = (index: number, patch: Partial<SurveyQuestionInput>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => setQuestions((prev) => [...prev, { ...EMPTY_QUESTION }]);
  const removeQuestion = (index: number) => setQuestions((prev) => prev.filter((_, i) => i !== index));

  const toggleUser = (id: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const needsOptions = (type: SurveyQuestionType) => type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';

  const handleSave = async (comoBorrador = false) => {
    if (!title.trim()) { setError('Ponle un título a la encuesta.'); return; }
    const validQuestions = questions.filter((q) => q.label.trim());
    if (validQuestions.length === 0) { setError('Agrega al menos una pregunta.'); return; }
    for (const q of validQuestions) {
      if (needsOptions(q.type) && (!q.options || q.options.filter((o) => o.trim()).length < 2)) {
        setError(`La pregunta "${q.label}" necesita al menos 2 opciones.`);
        return;
      }
    }
    // Un borrador puede quedar a medias: todavía no le llega a nadie, así que
    // no tiene sentido exigirle un canal. Eso se pide al publicarlo.
    if (!comoBorrador && selectedUserIds.size === 0 && !publicEnabled) {
      setError('Elige al menos un destinatario, o activa el enlace público para que respondan personas sin cuenta.');
      return;
    }

    setError('');
    setSaving(true);
    setGuardandoComo(comoBorrador ? 'BORRADOR' : 'PUBLICAR');
    try {
      await createSurvey({
        title: title.trim(),
        description: description.trim() || undefined,
        questions: validQuestions.map((q, i) => ({
          ...q,
          options: needsOptions(q.type) ? q.options?.filter((o) => o.trim()) : undefined,
          order: i,
        })),
        recipientUserIds: [...selectedUserIds],
        publicEnabled,
        guardarComoBorrador: comoBorrador,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear la encuesta.');
    } finally {
      setSaving(false);
      setGuardandoComo(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nueva encuesta</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div className="form-group">
            <label>Título *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div style={{ marginTop: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Preguntas</p>
            {questions.map((q, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => updateQuestion(i, { label: e.target.value })}
                    placeholder={`Pregunta ${i + 1}`}
                    style={{ flex: 1, padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                  />
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(i, { type: e.target.value as SurveyQuestionType })}
                    style={{ padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                  >
                    {SURVEY_QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={q.required ?? true} onChange={(e) => updateQuestion(i, { required: e.target.checked })} /> Obligatoria
                  </label>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {needsOptions(q.type) && (
                  <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
                    {(q.options && q.options.length > 0 ? q.options : ['', '']).map((opt, oi) => (
                      <input
                        key={oi}
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const opts = [...(q.options && q.options.length > 0 ? q.options : ['', ''])];
                          opts[oi] = e.target.value;
                          updateQuestion(i, { options: opts });
                        }}
                        placeholder={`Opción ${oi + 1}`}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '4px' }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => updateQuestion(i, { options: [...(q.options || ['', '']), ''] })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: '0.78rem', padding: '2px 0' }}
                    >
                      + Agregar opción
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button className="btn-secondary" onClick={addQuestion} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
              <Plus size={14} /> Agregar pregunta
            </button>
          </div>

          <div style={{ marginTop: '18px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
              ¿Por dónde se responde?
            </p>
            <label
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.82rem',
                border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 12, cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={publicEnabled}
                onChange={(e) => setPublicEnabled(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>Generar enlace público</strong>
                <span style={{ display: 'block', color: '#718096', marginTop: 2 }}>
                  Para que respondan personas sin cuenta (proveedores, clientes, postulantes), desde el
                  computador o el celular. El enlace aparece en el listado al crear la encuesta.
                  Si necesitas saber quién respondió, agrégalo como una pregunta más.
                </span>
              </span>
            </label>

            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
              Destinatarios en la app <span style={{ fontWeight: 400, color: '#a0aec0' }}>({selectedUserIds.size} seleccionados)</span>
            </p>
            {loadingUsers ? (
              <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Cargando empleados...</p>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
                {users.map((u) => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedUserIds.has(u.id)} onChange={() => toggleUser(u.id)} />
                    {u.fullName} <span style={{ color: '#a0aec0' }}>({u.email})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          {/* Guardar como borrador: la deja lista para terminarla después. No
              le llega a nadie y el enlace público no responde hasta publicarla. */}
          <button
            className="btn-secondary"
            onClick={() => handleSave(true)}
            disabled={saving}
            title="La guarda sin enviarla. Puedes terminarla y publicarla después."
          >
            {guardandoComo === 'BORRADOR' ? 'Guardando...' : 'Guardar como borrador'}
          </button>
          <button className="auth-btn" onClick={() => handleSave(false)} disabled={saving}>
            {guardandoComo === 'PUBLICAR' ? 'Enviando...' : 'Crear y enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
