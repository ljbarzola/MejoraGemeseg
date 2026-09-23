import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { login as loginService, saveAuth, requestPasswordReset, confirmPasswordReset } from '../../services/auth.service';
import { cachedThemeForDomain, useCompany } from '../../contexts/ThemeContext';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Formato de correo inválido'),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { theme, loadThemeByDomain, applyTheme } = useCompany();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  // Recuperar contraseña son DOS pasos: primero se pide el código al correo,
  // después se canjea por la contraseña nueva. Antes bastaba con poner un
  // correo y una contraseña para cambiarla, sin verificar nada.
  const [forgotPaso, setForgotPaso] = useState<'PEDIR_CODIGO' | 'CONFIRMAR'>('PEDIR_CODIGO');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword2, setForgotPassword2] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  const cerrarForgot = () => {
    setShowForgot(false);
    setForgotPaso('PEDIR_CODIGO');
    setForgotCode('');
    setForgotPassword2('');
    setForgotMsg('');
    setForgotError('');
  };
  const [detectedCompany, setDetectedCompany] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const emailValue = watch('email');

  useEffect(() => {
    const domain = (emailValue || '').split('@')[1]?.trim().toLowerCase() || '';
    const tld = domain.split('.').pop() || '';
    if (!domain.includes('.') || tld.length < 2) {
      setDetectedCompany(false);
      return;
    }
    const cached = cachedThemeForDomain(domain);
    if (cached?.logoUrl) {
      applyTheme(cached);
      setDetectedCompany(true);
    }
    let cancelled = false;
    loadThemeByDomain(domain).then((found) => {
      if (!cancelled) setDetectedCompany(found);
    });
    return () => { cancelled = true; };
  }, [emailValue, loadThemeByDomain, applyTheme]);

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    setLoading(true);
    try {
      localStorage.removeItem('company_theme');
      const res = await loginService(data);
      saveAuth(res);
      const domain = data.email.split('@')[1];
      if (domain) {
        // No bloquear la navegacion por esto: es solo cosmetico (colores/logo)
        // y no debe demorar el ingreso al dashboard si la API tarda en responder.
        loadThemeByDomain(domain).then((found) => { if (found) setDetectedCompany(true); });
      }
      // A la raiz, no a /dashboard: RootRedirect decide la primera seccion
      // que este usuario puede ver (ver App.tsx).
      navigate('/');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Credenciales inválidas';
      setServerError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotMsg('');
    setForgotLoading(true);
    try {
      if (forgotPaso === 'PEDIR_CODIGO') {
        const res = await requestPasswordReset({ email: forgotEmail });
        setForgotMsg(res.message);
        setForgotPaso('CONFIRMAR');
        return;
      }

      if (forgotPassword2.length < 8) {
        setForgotError('La contraseña debe tener al menos 8 caracteres');
        return;
      }
      const res = await confirmPasswordReset({
        email: forgotEmail,
        code: forgotCode,
        newPassword: forgotPassword2,
      });
      setForgotMsg(res.message);
      setForgotPaso('PEDIR_CODIGO');
      setForgotCode('');
      setForgotPassword2('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'No se pudo completar la recuperación. Inténtalo de nuevo.';
      setForgotError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          {detectedCompany && theme.logoUrl ? (
            <img src={theme.logoUrl} alt={theme.name} className="auth-logo" />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #4a5568, #718096)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          )}
          <h1>{showForgot ? 'Recuperar contraseña' : 'Iniciar sesión'}</h1>
          <p className="auth-subtitle">
            {!showForgot
              ? 'Ingresa con tu correo corporativo para acceder al sistema'
              : forgotPaso === 'PEDIR_CODIGO'
                ? 'Te enviaremos un código a tu correo para verificar que eres tú'
                : `Escribe el código que te enviamos a ${forgotEmail} y tu nueva contraseña`}
          </p>
        </div>

        {!showForgot ? (
          <>
            <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
              {serverError && (
                <div className="auth-error-banner">{serverError}</div>
              )}

              <div className="form-group">
                <label htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  {...register('email')}
                  className={errors.email ? 'input-error' : ''}
                />
                {errors.email && (
                  <span className="field-error">{errors.email.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  {...register('password')}
                  className={errors.password ? 'input-error' : ''}
                />
                {errors.password && (
                  <span className="field-error">{errors.password.message}</span>
                )}
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
              </button>
            </form>

            <div className="auth-footer">
              <span
                onClick={() => setShowForgot(true)}
                className="auth-link"
                style={{ cursor: 'pointer' }}
              >
                ¿Olvidaste tu contraseña?
              </span>
            </div>

            <div className="auth-footer">
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="auth-link">
                Regístrate aquí
              </Link>
            </div>
          </>
        ) : (
          <>
            {forgotError && <div className="auth-error-banner">{forgotError}</div>}
            {forgotMsg && (
              <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>
                {forgotMsg}
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="forgot-email">Correo electrónico</label>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  disabled={forgotPaso === 'CONFIRMAR'}
                  required
                />
              </div>

              {forgotPaso === 'CONFIRMAR' && (
                <>
                  <div className="form-group">
                    <label htmlFor="forgot-code">Código de 6 dígitos</label>
                    <input
                      id="forgot-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                      style={{ letterSpacing: '0.35em', fontSize: '1.15rem', textAlign: 'center', fontFamily: 'monospace' }}
                      required
                      autoFocus
                    />
                    <p style={{ fontSize: '0.75rem', color: '#718096', margin: '6px 0 0' }}>
                      Caduca en 15 minutos y solo sirve una vez.
                    </p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="forgot-password">Nueva contraseña</label>
                    <input
                      id="forgot-password"
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      value={forgotPassword2}
                      onChange={(e) => setForgotPassword2(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                </>
              )}

              <button type="submit" className="auth-btn" disabled={forgotLoading}>
                {forgotLoading
                  ? (forgotPaso === 'PEDIR_CODIGO' ? 'Enviando...' : 'Actualizando...')
                  : (forgotPaso === 'PEDIR_CODIGO' ? 'Enviarme el código' : 'Cambiar contraseña')}
              </button>
            </form>

            <div className="auth-footer">
              {forgotPaso === 'CONFIRMAR' && (
                <span
                  onClick={() => { setForgotPaso('PEDIR_CODIGO'); setForgotCode(''); setForgotError(''); setForgotMsg(''); }}
                  className="auth-link"
                  style={{ cursor: 'pointer', display: 'block', marginBottom: 8 }}
                >
                  No me llegó, enviar otro código
                </span>
              )}
              <span onClick={cerrarForgot} className="auth-link" style={{ cursor: 'pointer' }}>
                Volver al inicio de sesión
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
