import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { changePassword } from '../../services/auth.service';
import PasswordInput from '../../components/common/PasswordInput';
import ErrorBanner from '../../components/common/ErrorBanner';

const MIN_LARGO = 8;

/**
 * Modal "Cambiar contraseña" del perfil (con la sesión ya iniciada). Al
 * guardar, el servidor cierra las demás sesiones y esta sigue abierta (el
 * token nuevo lo guarda `changePassword`).
 */
export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<{ actual?: string; nueva?: string; repetida?: string }>({});
  const [errorServidor, setErrorServidor] = useState('');
  const [exito, setExito] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardando, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorServidor('');

    const nuevosErrores: typeof errores = {};
    if (!actual) nuevosErrores.actual = 'Escribe tu contraseña actual.';
    if (nueva.length < MIN_LARGO) {
      nuevosErrores.nueva = `La contraseña nueva debe tener al menos ${MIN_LARGO} caracteres.`;
    } else if (nueva === actual) {
      nuevosErrores.nueva = 'La contraseña nueva debe ser distinta a la actual.';
    }
    if (repetida !== nueva) nuevosErrores.repetida = 'Las contraseñas nuevas no coinciden.';
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    setGuardando(true);
    try {
      const res = await changePassword({ currentPassword: actual, newPassword: nueva });
      setExito(res.message);
      setActual('');
      setNueva('');
      setRepetida('');
    } catch (err: any) {
      // El servidor ya manda mensajes pensados para la persona; si no hay
      // respuesta (red, caída) se da uno propio, nunca el error crudo.
      const msg = err.response?.data?.message;
      setErrorServidor(
        (Array.isArray(msg) ? msg[0] : msg) ||
          'No se pudo cambiar la contraseña. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={guardando ? undefined : onClose}>
      <div
        className="modal"
        style={{ maxWidth: '460px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwd-modal-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="pwd-modal-titulo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={17} /> Cambiar contraseña
          </h3>
          <button className="modal-close" onClick={onClose} disabled={guardando} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {exito ? (
          <>
            <div className="modal-body">
              <div className="form-success" role="status">{exito}</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="auth-btn" onClick={onClose}>Listo</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-body profile-password-form">
              <div className="form-group">
                <label htmlFor="pwd-actual">Contraseña actual</label>
                <PasswordInput
                  id="pwd-actual"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className={errores.actual ? 'input-error' : ''}
                />
                {errores.actual && <span className="field-error">{errores.actual}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="pwd-nueva">Contraseña nueva</label>
                <PasswordInput
                  id="pwd-nueva"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  autoComplete="new-password"
                  className={errores.nueva ? 'input-error' : ''}
                />
                {errores.nueva ? (
                  <span className="field-error">{errores.nueva}</span>
                ) : (
                  <span className="profile-password-hint">Mínimo {MIN_LARGO} caracteres.</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="pwd-repetida">Repite la contraseña nueva</label>
                <PasswordInput
                  id="pwd-repetida"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  autoComplete="new-password"
                  className={errores.repetida ? 'input-error' : ''}
                />
                {errores.repetida && <span className="field-error">{errores.repetida}</span>}
              </div>

              <p className="profile-password-hint">
                Al cambiar tu contraseña se cerrará tu sesión en todos los demás dispositivos. En
                este seguirás con la sesión abierta.
              </p>

              <ErrorBanner mensaje={errorServidor} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" className="auth-btn" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
