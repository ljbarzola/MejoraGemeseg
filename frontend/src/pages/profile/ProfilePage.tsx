import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, getUserPreference, setUserPreference, updateMyPhone } from '../../services/user.service';
import type { ProfileData } from '../../services/user.service';
import { useToast } from '../../contexts/ToastContext';
import ChangePasswordModal from './ChangePasswordModal';
import { errorTelefono } from '../../utils/telefono';
import { usePerm } from '../../contexts/PermissionsContext';

// Cómo llegan los avisos de cada tipo. POR DEFECTO solo la notificación en la app: el correo hay que
// pedirlo (valor 'correo'). Mismas claves y valores que el backend (common/utils/avisos-correo.util.ts).
const SOLO_NOTIFICACIONES = 'solo-notificaciones';
const CORREO = 'correo';
const TIPOS_AVISO: { clave: string; titulo: string; detalle: string; seccion?: string }[] = [
  {
    clave: 'notificaciones:tareas-avisos',
    titulo: 'Tareas: asignaciones y cambios',
    detalle: 'Cuando te asignan una tarea o cambia su estado, se edita o se elimina.',
  },
  {
    clave: 'notificaciones:recordatorios-tareas',
    titulo: 'Tareas: recordatorios de vencimiento',
    detalle: 'Antes de que venza la fecha fin de tus tareas. Si tienes varias el mismo día, llegan juntas; máximo un correo al día.',
  },
  {
    clave: 'notificaciones:contratacion-publica',
    titulo: 'Contratación Pública',
    detalle: 'Avisos de entregas de documentos y vencimientos de las entidades.',
    seccion: 'CONTRATACION_PUBLICA',
  },
  {
    clave: 'notificaciones:operaciones-resumen',
    titulo: 'Operaciones: resumen diario',
    detalle: 'Una sola notificación cada mañana con lo pendiente: faltas sin cubrir, puestos sin cobertura, bitácoras sin subir, armas por vencer, inventario bajo el mínimo, supervisión, horarios sin aprobar y contratos por vencer. Si no hay nada pendiente, no llega.',
    seccion: 'OPERACIONES',
  },
];

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
  const { canView } = usePerm();
  // Por tipo de aviso: true = también por correo. null = todavía cargando o no se pudo leer.
  const [avisosCorreo, setAvisosCorreo] = useState<Record<string, boolean> | null>(null);
  const [guardandoAviso, setGuardandoAviso] = useState<string | null>(null);
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
    Promise.all(TIPOS_AVISO.map((t) => getUserPreference(t.clave)))
      .then((valores) => {
        const mapa: Record<string, boolean> = {};
        TIPOS_AVISO.forEach((t, i) => {
          const v = valores[i];
          mapa[t.clave] = Array.isArray(v) && v.includes(CORREO);
        });
        setAvisosCorreo(mapa);
      })
      .catch(() => { /* la sección avisa que no se pudo cargar */ });
  }, []);

  // Enlace directo desde el formulario de tareas (/profile#avisos): baja hasta la sección de avisos.
  useEffect(() => {
    if (loading || window.location.hash !== '#avisos') return;
    document.getElementById('avisos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, avisosCorreo]);

  const cambiarAviso = async (clave: string, correo: boolean) => {
    if (guardandoAviso || !avisosCorreo || avisosCorreo[clave] === correo) return;
    const anterior = avisosCorreo;
    setAvisosCorreo({ ...avisosCorreo, [clave]: correo });
    setGuardandoAviso(clave);
    try {
      await setUserPreference(clave, [correo ? CORREO : SOLO_NOTIFICACIONES]);
      showToast(correo ? 'Listo: este aviso te llegará en la app y por correo.' : 'Listo: este aviso te llegará solo en la app, sin correo.', 'success');
    } catch {
      setAvisosCorreo(anterior);
      showToast('No pudimos guardar tu elección. Inténtalo de nuevo en unos segundos.', 'error');
    } finally {
      setGuardandoAviso(null);
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

        <div className="profile-password-section" id="avisos">
          <h2 className="profile-tools-title">Avisos: app o correo</h2>
          <p className="profile-option-hint">
            Todos los avisos te llegan en las notificaciones de la app. Aquí eliges, para cada tipo, si además quieres recibirlos por correo a {profile.email}.
            Los avisos de seguridad, como el cambio de contraseña, siempre llegan por correo.
          </p>
          {avisosCorreo === null ? (
            <p className="profile-option-hint">No se pudo cargar esta opción. Recarga la página para intentarlo de nuevo.</p>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Aviso</th>
                    <th>Cómo quieres recibirlo</th>
                  </tr>
                </thead>
                <tbody>
                  {TIPOS_AVISO.filter((t) => !t.seccion || canView(t.seccion)).map((t) => (
                    <tr key={t.clave}>
                      <td>
                        <strong>{t.titulo}</strong>
                        <div className="profile-option-hint" style={{ margin: 0 }}>{t.detalle}</div>
                      </td>
                      <td>
                        <select
                          className="filter-select"
                          aria-label={`Cómo recibir: ${t.titulo}`}
                          value={avisosCorreo[t.clave] ? 'correo' : 'app'}
                          disabled={guardandoAviso !== null}
                          onChange={(e) => cambiarAviso(t.clave, e.target.value === 'correo')}
                        >
                          <option value="app">Solo en la app</option>
                          <option value="correo">En la app y por correo</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
