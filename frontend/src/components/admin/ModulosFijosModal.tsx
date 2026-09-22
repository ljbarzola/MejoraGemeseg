import { useState } from 'react';
import { X, Settings2, Lock } from 'lucide-react';
import { setFixedSections, type SectionConfig } from '../../services/permissions.service';
import ConfirmDialog from '../common/ConfirmDialog';

/**
 * Configura qué módulos ve TODO el mundo en la empresa.
 *
 * Un módulo marcado aquí deja de poder negarse usuario por usuario: en la
 * pantalla de permisos aparece marcado y bloqueado para todos. Sirve para lo
 * que en esta organización usa cualquiera (por ejemplo Capacitaciones), sin
 * tener que acordarse de marcárselo a cada persona nueva.
 *
 * Distinto de las fijas por producto (Inicio, Proyectos): esas vienen fijas en
 * el código, son iguales para todas las empresas y aquí salen bloqueadas.
 */
export default function ModulosFijosModal({
  companyId,
  sections,
  onClose,
  onSaved,
}: {
  companyId: number;
  sections: SectionConfig[];
  onClose: () => void;
  onSaved: (actualizadas: SectionConfig[]) => void;
}) {
  const habilitadas = sections.filter((s) => s.enabled);
  const [marcadas, setMarcadas] = useState<Set<string>>(
    new Set(habilitadas.filter((s) => s.fixedForAll).map((s) => s.key)),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const original = new Set(habilitadas.filter((s) => s.fixedForAll).map((s) => s.key));
  const hayCambios =
    marcadas.size !== original.size || [...marcadas].some((k) => !original.has(k));

  const toggle = (key: string) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const guardar = async () => {
    setConfirmando(false);
    setGuardando(true);
    setError('');
    try {
      const actualizadas = await setFixedSections(companyId, [...marcadas]);
      onSaved(actualizadas);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudieron guardar los módulos fijos.');
    } finally {
      setGuardando(false);
    }
  };

  // Para el mensaje de confirmación: qué se activa y qué se quita.
  const seActivan = [...marcadas].filter((k) => !original.has(k));
  const seQuitan = [...original].filter((k) => !marcadas.has(k));
  const etiqueta = (key: string) => sections.find((s) => s.key === key)?.label || key;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 size={17} /> Módulos visibles para todos
            </h3>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>

          <div className="modal-body">
            <p style={{ fontSize: '0.85rem', color: '#718096', margin: '0 0 16px' }}>
              Lo que marques aquí lo verá <strong>todo el personal</strong> de la empresa, y
              dejará de poder quitarse persona por persona. Útil para lo que usa
              cualquiera; el resto se sigue asignando uno por uno en la pantalla de permisos.
            </p>

            {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {habilitadas.map((s) => {
                const bloqueado = Boolean(s.fixedLockedByCode);
                const marcado = bloqueado || marcadas.has(s.key);
                return (
                  <label
                    key={s.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '10px',
                      cursor: bloqueado ? 'not-allowed' : 'pointer',
                      background: bloqueado ? '#f8fafc' : '#fff',
                      opacity: bloqueado ? 0.75 : 1,
                    }}
                    title={bloqueado ? 'Siempre visible para todos: es la pantalla de inicio y el menú básico' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={bloqueado}
                      onChange={() => toggle(s.key)}
                      style={{ width: '17px', height: '17px', accentColor: '#48bb78' }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--azul-oscuro)', flex: 1 }}>
                      {s.label}
                    </span>
                    {bloqueado && (
                      <span
                        className="status-badge"
                        style={{ background: '#e2e8f0', color: '#718096', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Lock size={11} /> Fijo del sistema
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {habilitadas.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: '#a0aec0' }}>
                Esta empresa no tiene módulos habilitados todavía.
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button
              className="auth-btn"
              onClick={() => setConfirmando(true)}
              disabled={guardando || !hayCambios}
              title={!hayCambios ? 'No hay cambios que guardar' : undefined}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {confirmando && (
        <ConfirmDialog
          title="Cambiar los módulos visibles para todos"
          message={[
            seActivan.length
              ? `Pasarán a verlo TODOS: ${seActivan.map(etiqueta).join(', ')}.`
              : '',
            seQuitan.length
              ? `Dejarán de ser fijos: ${seQuitan.map(etiqueta).join(', ')}. A partir de ahí cada persona los verá solo si tiene el permiso marcado.`
              : '',
            'Afecta a todo el personal de la empresa. ¿Continuar?',
          ].filter(Boolean).join(' ')}
          confirmLabel="Sí, guardar"
          onConfirm={guardar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
