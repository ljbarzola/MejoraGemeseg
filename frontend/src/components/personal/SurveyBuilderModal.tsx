import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Info } from 'lucide-react';
import { getUsers, type AdminUser } from '../../services/user.service';
import {
  createSurvey,
  getSurvey,
  updateSurvey,
  updateSurveyRecipients,
  setSurveyPublicLink,
  publishSurvey,
  SURVEY_QUESTION_TYPES,
  type SurveyQuestionInput,
  type SurveyQuestionType,
  type SurveyStatus,
} from '../../services/personal.service';
import ConfirmDialog from '../common/ConfirmDialog';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  /** Si viene, el formulario edita esa encuesta (en cualquier estado) en vez de crear una nueva. */
  surveyId?: number;
}

// Pregunta del formulario: las que ya existían traen `id` y cuántas respuestas
// tienen (`respuestas`), para avisar antes de borrarlas o cambiarles el tipo.
type FormQuestion = SurveyQuestionInput & { respuestas?: number };

const EMPTY_QUESTION: FormQuestion = { label: '', type: 'SHORT_TEXT', required: true, options: [] };
const TIPOS_TEXTO: SurveyQuestionType[] = ['SHORT_TEXT', 'LONG_TEXT'];

// Constructor de encuestas: RRHH arma preguntas dinámicas y elige por dónde
// enviarla. Sirve para crear (como borrador o ya publicada) y para editar una
// encuesta existente en cualquier estado.
//
// Dos canales, que se pueden combinar en la misma encuesta:
//  - Destinatarios de la app: la reciben en "Mis Encuestas" y responden una
//    sola vez, identificados.
//  - Enlace público: una URL que cualquiera abre sin cuenta ni login. Si RRHH
//    quiere saber quién respondió, lo agrega como una pregunta más.
// Debe quedar activo al menos uno para publicarla; si no, no le llegaría a nadie.
//
// Al editar una encuesta ya publicada o cerrada los cambios valen solo para
// quien responda desde ahora; lo ya respondido no se modifica. Quitar una
// pregunta con respuestas las borra, y se pide confirmación.
export default function SurveyBuilderModal({ onClose, onCreated, surveyId }: Props) {
  const editando = surveyId !== undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<FormQuestion[]>([{ ...EMPTY_QUESTION }]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSurvey, setLoadingSurvey] = useState(editando);
  const [saving, setSaving] = useState(false);
  // Qué botón se pulsó, para mostrar el texto correcto mientras guarda.
  const [guardandoComo, setGuardandoComo] = useState<'BORRADOR' | 'PUBLICAR' | null>(null);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  // Solo al editar: cómo estaba la encuesta al abrirla, para calcular qué cambió.
  const [estado, setEstado] = useState<SurveyStatus>('DRAFT');
  const [originales, setOriginales] = useState<{ destinatarios: Set<number>; enlace: boolean }>({
    destinatarios: new Set(),
    enlace: false,
  });
  // Destinatarios que ya respondieron: no se pueden quitar (su respuesta se conserva).
  const [yaRespondieron, setYaRespondieron] = useState<Set<number>>(new Set());
  const [quitandoIdx, setQuitandoIdx] = useState<number | null>(null);

  useEffect(() => {
    getUsers({ isActive: 'true' }).then(setUsers).finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (surveyId === undefined) return;
    getSurvey(surveyId)
      .then((s) => {
        setTitle(s.title);
        setDescription(s.description ?? '');
        setEstado(s.status);
        setQuestions(
          (s.questions ?? []).map((q) => ({
            id: q.id,
            label: q.label,
            type: q.type,
            options: q.options ?? [],
            required: q.required,
            respuestas: q._count?.answers ?? 0,
          })),
        );
        const dest = new Set((s.recipients ?? []).map((r) => r.user.id));
        setSelectedUserIds(dest);
        setPublicEnabled(!!s.publicEnabled);
        setOriginales({ destinatarios: new Set(dest), enlace: !!s.publicEnabled });
        setYaRespondieron(new Set((s.recipients ?? []).filter((r) => r.respondedAt).map((r) => r.user.id)));
      })
      .catch(() => setError('No se pudo cargar la encuesta. Cierra e inténtalo de nuevo.'))
      .finally(() => setLoadingSurvey(false));
  }, [surveyId]);

  // Los errores quedan arriba del modal, que scrollea: hay que traerlos a la vista.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const updateQuestion = (index: number, patch: Partial<FormQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => setQuestions((prev) => [...prev, { ...EMPTY_QUESTION }]);
  const removeQuestion = (index: number) => setQuestions((prev) => prev.filter((_, i) => i !== index));

  // Una pregunta con respuestas pide confirmación: borrarla las borra también.
  const pedirQuitar = (index: number) => {
    if ((questions[index].respuestas ?? 0) > 0) setQuitandoIdx(index);
    else removeQuestion(index);
  };

  const toggleUser = (id: number) => {
    if (yaRespondieron.has(id)) return;
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
    // no tiene sentido exigirle un canal. Eso se pide al publicarlo. Una
    // encuesta ya publicada o cerrada sí necesita seguir teniendo uno.
    const exigeCanal = editando ? estado !== 'DRAFT' || !comoBorrador : !comoBorrador;
    if (exigeCanal && selectedUserIds.size === 0 && !publicEnabled) {
      setError('Elige al menos un destinatario, o activa el enlace público para que respondan personas sin cuenta.');
      return;
    }

    setError('');
    setSaving(true);
    setGuardandoComo(comoBorrador ? 'BORRADOR' : 'PUBLICAR');
    const preguntas: SurveyQuestionInput[] = validQuestions.map((q, i) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      required: q.required,
      options: needsOptions(q.type) ? q.options?.filter((o) => o.trim()) : undefined,
      order: i,
    }));
    let guardadoParcial = false;
    try {
      if (!editando) {
        await createSurvey({
          title: title.trim(),
          description: description.trim() || undefined,
          questions: preguntas,
          recipientUserIds: [...selectedUserIds],
          publicEnabled,
          guardarComoBorrador: comoBorrador,
        });
      } else {
        await updateSurvey(surveyId, {
          title: title.trim(),
          description: description.trim() || undefined,
          questions: preguntas,
        });
        guardadoParcial = true;
        // Primero se activa el enlace y al final se apaga, para que la encuesta
        // nunca pase por un momento sin ningún canal (el servidor lo rechazaría).
        if (publicEnabled && !originales.enlace) await setSurveyPublicLink(surveyId, true);
        const add = [...selectedUserIds].filter((id) => !originales.destinatarios.has(id));
        const remove = [...originales.destinatarios].filter((id) => !selectedUserIds.has(id));
        if (add.length > 0 || remove.length > 0) await updateSurveyRecipients(surveyId, { add, remove });
        if (!publicEnabled && originales.enlace) await setSurveyPublicLink(surveyId, false);
        if (estado === 'DRAFT' && !comoBorrador) await publishSurvey(surveyId);
      }
      onCreated();
      onClose();
    } catch (err: any) {
      // Si ya se guardaron las preguntas pero falló un paso posterior, el listado
      // se actualiza igual para que no muestre datos viejos.
      if (guardadoParcial) onCreated();
      const msg = err.response?.data?.message;
      setError(
        (Array.isArray(msg) ? msg.join(' ') : msg) ||
          (editando ? 'No se pudieron guardar los cambios.' : 'No se pudo crear la encuesta.'),
      );
    } finally {
      setSaving(false);
      setGuardandoComo(null);
    }
  };

  const conRespuestas = questions.filter((q) => (q.respuestas ?? 0) > 0).length;
  const quitando = quitandoIdx !== null ? questions[quitandoIdx] : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editando ? 'Editar encuesta' : 'Nueva encuesta'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div ref={errorRef}>
            {error && <div className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}
          </div>

          {loadingSurvey ? (
            <p style={{ fontSize: '0.85rem', color: '#a0aec0' }}>Cargando encuesta...</p>
          ) : (
            <>
              {editando && estado !== 'DRAFT' && (
                <div
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', background: '#ebf8ff', border: '1px solid #bee3f8',
                    borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: '0.82rem', color: '#2a4365', lineHeight: 1.45,
                  }}
                >
                  <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Esta encuesta ya está {estado === 'CLOSED' ? 'cerrada' : 'publicada'}. Los cambios aplican solo a
                    quienes la respondan <strong>de ahora en adelante</strong>; lo que ya respondieron no se modifica.
                    {conRespuestas > 0 && ' Las preguntas con respuestas muestran cuántas tienen.'}
                  </span>
                </div>
              )}

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
                {questions.map((q, i) => {
                  const respuestas = q.respuestas ?? 0;
                  // Con respuestas guardadas el tipo ya no se puede cambiar, salvo entre texto corto y largo.
                  const tiposPermitidos = respuestas > 0
                    ? SURVEY_QUESTION_TYPES.filter((t) => (TIPOS_TEXTO.includes(q.type) ? TIPOS_TEXTO.includes(t.value) : t.value === q.type))
                    : SURVEY_QUESTION_TYPES;
                  return (
                    <div key={q.id ?? `nueva-${i}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
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
                          disabled={respuestas > 0 && tiposPermitidos.length === 1}
                          title={respuestas > 0 ? 'Con respuestas guardadas el tipo no se puede cambiar' : undefined}
                          style={{ padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
                        >
                          {tiposPermitidos.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={q.required ?? true} onChange={(e) => updateQuestion(i, { required: e.target.checked })} /> Obligatoria
                        </label>
                        {questions.length > 1 && (
                          <button
                            onClick={() => pedirQuitar(i)}
                            aria-label={`Quitar la pregunta ${i + 1}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      {respuestas > 0 && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#718096' }}>
                          {respuestas === 1 ? '1 respuesta guardada' : `${respuestas} respuestas guardadas`}
                          {needsOptions(q.type) && '. Cambiar o quitar opciones no modifica lo ya respondido.'}
                        </p>
                      )}

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
                            onClick={() => updateQuestion(i, { options: [...(q.options && q.options.length > 0 ? q.options : ['', '']), ''] })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: '0.78rem', padding: '2px 0' }}
                          >
                            + Agregar opción
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="btn-secondary" onClick={addQuestion} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                  <Plus size={14} /> Agregar pregunta
                </button>
                {editando && estado !== 'DRAFT' && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#718096' }}>
                    Una pregunta nueva solo la verán, y la responderán, quienes entren a la encuesta desde ahora.
                  </p>
                )}
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
                      computador o el celular. El enlace aparece en el listado al guardar la encuesta.
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
                    {users.map((u) => {
                      const respondio = yaRespondieron.has(u.id);
                      return (
                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '0.82rem', cursor: respondio ? 'default' : 'pointer' }}>
                          <input type="checkbox" checked={selectedUserIds.has(u.id)} disabled={respondio} onChange={() => toggleUser(u.id)} />
                          {u.fullName} <span style={{ color: '#a0aec0' }}>({u.email})</span>
                          {respondio && <span style={{ color: '#718096', fontStyle: 'italic' }}>ya respondió</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          {/* Guardar como borrador: la deja lista para terminarla después. No
              le llega a nadie y el enlace público no responde hasta publicarla. */}
          {(!editando || estado === 'DRAFT') && (
            <button
              className="btn-secondary"
              onClick={() => handleSave(true)}
              disabled={saving || loadingSurvey}
              title="La guarda sin enviarla. Puedes terminarla y publicarla después."
            >
              {guardandoComo === 'BORRADOR' ? 'Guardando...' : editando ? 'Guardar borrador' : 'Guardar como borrador'}
            </button>
          )}
          <button className="auth-btn" onClick={() => handleSave(false)} disabled={saving || loadingSurvey}>
            {guardandoComo === 'PUBLICAR'
              ? (editando && estado !== 'DRAFT' ? 'Guardando...' : 'Enviando...')
              : !editando
                ? 'Crear y enviar'
                : estado === 'DRAFT'
                  ? 'Guardar y publicar'
                  : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {quitando && quitandoIdx !== null && (
        <ConfirmDialog
          title="Quitar pregunta"
          danger
          message={`La pregunta "${quitando.label || `Pregunta ${quitandoIdx + 1}`}" tiene ${quitando.respuestas} ${quitando.respuestas === 1 ? 'respuesta' : 'respuestas'}. Si la quitas y guardas, esas respuestas se pierden y ya no saldrán en los resultados. Esto no se puede deshacer.`}
          confirmLabel="Sí, quitar"
          onConfirm={() => { removeQuestion(quitandoIdx); setQuitandoIdx(null); }}
          onCancel={() => setQuitandoIdx(null)}
        />
      )}
    </div>
  );
}
