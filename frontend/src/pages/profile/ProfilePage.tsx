import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, getUserPreference, setUserPreference, updateMyPhone } from '../../services/user.service';
import type { ProfileData } from '../../services/user.service';
import { useToast } from '../../contexts/ToastContext';
import ChangePasswordModal from './ChangePasswordModal';
import { errorTelefono } from '../../utils/telefono';

// Cómo llegan los recordatorios de tareas. Sin nada guardado se envía correo
// (es lo que ya pasaba); solo «solo-notificaciones» lo apaga. Misma clave y valor que
// usa el backend (tasks/task-reminders.util.ts).
const CLAVE_AVISOS_TAREAS = 'notificaciones:recordatorios-tareas';
const SOLO_NOTIFICACIONES = 'solo-notificaciones';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  EMPLOYEE: 'Empleado',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const { showToast } = useToast();
  // null = todavía cargando o no se pudo leer (no se muestra una opción que podría ser falsa).
  const [soloNotificaciones, setSoloNotificaciones] = useState<boolean | null>(null);
  const [guardandoAvisos, setGuardandoAvisos] = useState(false);
  // Teléfono propio: null = no se está editando.
  const [telefonoEdit, setTelefonoEdit] = useState<string | null>(null);
  const [telefonoError, setTelefonoError] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);

  const guardarTelefono = async () => {
    if (telefonoEdit === null || guardandoTelefono) return;
    const err = errorTelefono(telefonoEdit);
    if (err) return setTelefonoError(err);
    setGuardandoTelefono(true);
    try {
      const r = await updateMyPhone(telefonoEdit);
      setProfile((p) => (p ? { ...p, phone: r.phone } : p));
      setTelefonoEdit(null);
      setTelefonoError('');
      showToast(r.phone ? 'Teléfono guardado' : 'Teléfono borrado', 'success');
    } catch {
      setTelefonoError('No pudimos guardar tu teléfono. Revisa el número e inténtalo de nuevo.');
    } finally {
      setGuardandoTelefono(false);
    }
  };

  useEffect(() => {
    getMe()
      .then(setProfile)
      .finally(() => setLoading(false));
    getUserPreference(CLAVE_AVISOS_TAREAS)
      .then((valor) => setSoloNotificaciones(Array.isArray(valor) && valor.includes(SOLO_NOTIFICACIONES)))
      .catch(() => { /* la sección avisa que no se pudo cargar */ });
  }, []);

  const cambiarAvisos = async (solo: boolean) => {
    if (guardandoAvisos || solo === soloNotificaciones) return;
    const anterior = soloNotificaciones;
    setSoloNotificaciones(solo);
    setGuardandoAvisos(true);
    try {
      await setUserPreference(CLAVE_AVISOS_TAREAS, [solo ? SOLO_NOTIFICACIONES : 'correo']);
      showToast(solo ? 'Listo: los recordatorios te llegarán solo en las notificaciones de la app, sin correo.' : 'Listo: los recordatorios te llegarán en las notificaciones de la app y por correo.', 'success');
    } catch {
      setSoloNotificaciones(anterior);
      showToast('No pudimos guardar tu elección. Inténtalo de nuevo en unos segundos.', 'error');
    } finally {
      setGuardandoAvisos(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Cargando perfil...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <p>No se pudo cargar el perfil</p>
          <button className="auth-btn" onClick={() => navigate('/dashboard')}>Volver al dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/dashboard')}>
        &larr; Volver al dashboard
      </button>

      <div className="page-card" style={{ maxWidth: '640px' }}>
        <div className="profile-header">
          <div className="profile-avatar">{profile.fullName.charAt(0)}</div>
          <div>
            <h1 className="profile-name">{profile.fullName}</h1>
            <span
              className="role-badge"
              style={{
                background: profile.role === 'ADMIN' ? 'linear-gradient(135deg, #fef3c7, #fde68a)' :
                  profile.role === 'MANAGER' ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' :
                    'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                color: profile.role === 'ADMIN' ? '#92400e' :
                  profile.role === 'MANAGER' ? '#1e40af' : '#3730a3',
              }}
            >
              {ROLE_LABELS[profile.role] || profile.role}
            </span>
          </div>
        </div>

        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Correo corporativo</span>
            <span className="profile-info-value">{profile.email}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Documento de identidad</span>
            <span className="profile-info-value">{profile.documentNumber || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Cargo</span>
            <span className="profile-info-value">{profile.position || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Teléfono</span>
            {telefonoEdit === null ? (
              <span className="profile-info-value profile-phone-row">
                {profile.phone || '—'}
                <button
                  type="button"
                  className="profile-phone-btn"
                  onClick={() => {
                    setTelefonoEdit(profile.phone ?? '');
                    setTelefonoError('');
                  }}
                >
                  {profile.phone ? 'Editar' : 'Agregar'}
                </button>
              </span>
            ) : (
              <form
                className="profile-phone-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void guardarTelefono();
                }}
              >
                <input
                  type="tel"
                  value={telefonoEdit}
                  autoFocus
                  maxLength={25}
                  placeholder="+593 99 897 4909"
                  aria-label="Teléfono"
                  aria-invalid={!!telefonoError}
                  className={telefonoError ? 'input-error' : ''}
                  onChange={(e) => {
                    setTelefonoEdit(e.target.value);
                    setTelefonoError('');
                  }}
                />
                <div className="profile-phone-actions">
                  <button type="submit" className="profile-phone-btn primary" disabled={guardandoTelefono}>
                    {guardandoTelefono ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" className="profile-phone-btn" onClick={() => setTelefonoEdit(null)} disabled={guardandoTelefono}>
                    Cancelar
                  </button>
                </div>
                {telefonoError && <span className="field-error" role="alert">{telefonoError}</span>}
              </form>
            )}
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Departamento</span>
            <span className="profile-info-value">{profile.department?.name || '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Miembro desde</span>
            <span className="profile-info-value">
              {new Date(profile.createdAt).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.createdProjects}</span>
            <span className="profile-stat-label">Proyectos creados</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.projectMemberships}</span>
            <span className="profile-stat-label">Proyectos asignados</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-number">{profile._count.taskAssignees}</span>
            <span className="profile-stat-label">Tareas asignadas</span>
          </div>
        </div>

        <div className="profile-tools-section">
          <h2 className="profile-tools-title">Herramientas asignadas ({profile.toolAssignments.length})</h2>
          {profile.toolAssignments.length === 0 ? (
            <div className="profile-tools-empty">No tienes herramientas asignadas</div>
          ) : (
            <div className="profile-tools-grid">
              {profile.toolAssignments.map((ta) => (
                <div key={ta.id} className="profile-tool-card">
                  <div className="profile-tool-icon">🛠</div>
                  <div className="profile-tool-info">
                    <span className="profile-tool-name">{ta.tool.name}</span>
                    {ta.tool.category && <span className="tools-category">{ta.tool.category}</span>}
                    {ta.version && <span className="tools-version">v{ta.version}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-password-section">
          <h2 className="profile-tools-title">Recordatorios de tareas</h2>
          <p className="profile-option-hint">
            Te avisamos antes de que venza la fecha fin de las tareas que tienes asignadas. Si tienes varias el mismo día, te llegan juntas en un solo mensaje, y
            nunca recibes más de un correo al día.
          </p>
          {soloNotificaciones === null ? (
            <p className="profile-option-hint">No se pudo cargar esta opción. Recarga la página para intentarlo de nuevo.</p>
          ) : (
            <div className="profile-option-group" role="radiogroup" aria-label="Cómo recibir los recordatorios de tareas">
              <label className={`profile-option ${!soloNotificaciones ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="avisos-tareas"
                  checked={!soloNotificaciones}
                  disabled={guardandoAvisos}
                  onChange={() => cambiarAvisos(false)}
                />
                <span>
                  <strong>Notificaciones en la app y correo</strong>
                  <small>Te avisamos en las notificaciones de la app (el ícono de campana, arriba a la derecha) y también por correo a {profile.email}.</small>
                </span>
              </label>
              <label className={`profile-option ${soloNotificaciones ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="avisos-tareas"
                  checked={soloNotificaciones}
                  disabled={guardandoAvisos}
                  onChange={() => cambiarAvisos(true)}
                />
                <span>
                  <strong>Solo notificaciones en la app</strong>
                  <small>Te avisamos solo dentro de la app, en el ícono de campana. No te enviamos correo.</small>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="profile-password-section">
          <h2 className="profile-tools-title">Seguridad</h2>
          {profile.hasPassword ? (
            <div>
              <button className="btn-secondary" onClick={() => setShowPasswordModal(true)}>
                Cambiar contraseña
              </button>
            </div>
          ) : (
            <div className="auth-info-banner">
              Tu cuenta entra con Google y todavía no tiene contraseña. Si quieres crear una, usa
              «¿Olvidaste tu contraseña?» en la pantalla de inicio de sesión.
            </div>
          )}
        </div>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}
