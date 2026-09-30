import { useState, useEffect, useRef } from 'react';
import { Info, Undo2, UserMinus } from 'lucide-react';
import { getUsers, type AdminUser } from '../../services/user.service';
import {
  getSurvey,
  updateSurveyRecipients,
  type Survey,
  type SurveyStatus,
} from '../../services/personal.service';

interface Props {
  surveyId: number;
  status: SurveyStatus;
  /** Se llama tras guardar, para que quien abrió el modal refresque sus conteos. */
  onChanged: () => void;
}

// Quién recibió la encuesta en la app y si ya respondió. RRHH puede quitar a
// los pendientes y agregar gente nueva; quien ya respondió queda fijo porque
// su respuesta se conserva. Los cambios se acumulan y se guardan de una vez.
export default function SurveyRecipientsPanel({ surveyId, status, onChanged }: Props) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toRemove, setToRemove] = useState<Set<number>>(new Set());
  const [toAdd, setToAdd] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const cerrada = status === 'CLOSED';

  useEffect(() => {
    setLoading(true);
    Promise.all([getSurvey(surveyId), getUsers({ isActive: 'true' })])
      .then(([s, u]) => {
        setSurvey(s);
        setUsers(u);
      })
      .catch(() => setError('No se pudieron cargar los destinatarios. Intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, [surveyId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const recipients = survey?.recipients ?? [];
  const assignedIds = new Set(recipients.map((r) => r.user.id));
  const term = search.trim().toLowerCase();
  const candidates = users.filter(
    (u) =>
      !assignedIds.has(u.id) &&
      (!term || u.fullName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
  );
  const hasChanges = toRemove.size > 0 || toAdd.size > 0;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await updateSurveyRecipients(surveyId, {
        add: [...toAdd],
        remove: [...toRemove],
      });
      setSurvey(updated);
      setToAdd(new Set());
      setToRemove(new Set());
      setSaved(true);
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Cargando destinatarios...</div>;

  return (
    <div>
      <div
        style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#ebf8ff',
          border: '1px solid #bee3f8', borderRadius: '8px', padding: '10px 12px',
          fontSize: '0.8rem', color: '#2c5282', marginBottom: '14px',
        }}
      >
        <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Los cambios solo aplican a quienes <strong>aún no han respondido</strong>. Quien ya respondió no se puede
          quitar y su respuesta se conserva. A las personas que agregues les aparece la encuesta en "Mis Encuestas".
          Las respuestas por enlace público no dependen de esta lista.
        </span>
      </div>

      {cerrada && (
        <p style={{ fontSize: '0.82rem', color: '#975a16', background: '#fffaf0', border: '1px solid #fbd38d', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px' }}>
          La encuesta está cerrada. Vuelve a abrirla para cambiar sus destinatarios.
        </p>
      )}

      {error && (
        <div ref={errorRef} className="form-error" style={{ marginBottom: '12px' }}>
          {error}
        </div>
      )}
      {saved && !error && (
        <p style={{ fontSize: '0.82rem', color: '#276749', marginBottom: '12px' }}>Cambios guardados.</p>
      )}

      <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
        Destinatarios actuales{' '}
        <span style={{ fontWeight: 400, color: '#a0aec0' }}>
          ({recipients.filter((r) => r.respondedAt).length} de {recipients.length} respondieron)
        </span>
      </p>
      {recipients.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: '#a0aec0', margin: '4px 0 14px' }}>
          Esta encuesta no tiene destinatarios en la app.
        </p>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
          {recipients.map((r, i) => {
            const respondio = !!r.respondedAt;
            const marcado = toRemove.has(r.user.id);
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '0.82rem',
                  borderTop: i === 0 ? 'none' : '1px solid #edf2f7',
                  opacity: marcado ? 0.55 : 1,
                }}
              >
                <div style={{ minWidth: 0, flex: 1, textDecoration: marcado ? 'line-through' : 'none' }}>
                  <strong style={{ color: 'var(--azul-oscuro)' }}>{r.user.fullName}</strong>{' '}
                  <span style={{ color: '#a0aec0' }}>{r.user.email}</span>
                </div>
                {respondio ? (
                  <span className="status-badge" style={{ background: '#c6f6d5', color: '#276749', fontSize: '0.72rem' }}>
                    Respondió {new Date(r.respondedAt!).toLocaleDateString('es-EC')}
                  </span>
                ) : (
                  <>
                    <span className="status-badge" style={{ background: '#fefcbf', color: '#975a16', fontSize: '0.72rem' }}>
                      Pendiente
                    </span>
                    {!cerrada && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => setToRemove((prev) => toggle(prev, r.user.id))}
                      >
                        {marcado ? <><Undo2 size={12} /> Deshacer</> : <><UserMinus size={12} /> Quitar</>}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!cerrada && (
        <>
          <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
            Agregar destinatarios <span style={{ fontWeight: 400, color: '#a0aec0' }}>({toAdd.size} seleccionados)</span>
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '6px' }}
          />
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '170px', overflowY: 'auto', padding: '6px' }}>
            {candidates.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#a0aec0', margin: '4px 6px' }}>
                {term ? 'Nadie coincide con la búsqueda.' : 'Todos los usuarios activos ya son destinatarios.'}
              </p>
            ) : (
              candidates.map((u) => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={toAdd.has(u.id)} onChange={() => setToAdd((prev) => toggle(prev, u.id))} />
                  {u.fullName} <span style={{ color: '#a0aec0' }}>({u.email})</span>
                </label>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button className="auth-btn" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
