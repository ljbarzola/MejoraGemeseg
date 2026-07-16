import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { login as loginService, saveAuth, forgotPassword } from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';

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
  const { theme, loadThemeBySlug } = useCompany();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPassword2, setForgotPassword2] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const detectCompany = async () => {
      const emailInput = document.getElementById('email') as HTMLInputElement;
      if (!emailInput) return;
      const handler = async () => {
        const email = emailInput.value;
        const domain = email.split('@')[1];
        if (domain) {
          const slug = domain.split('.')[0];
          await loadThemeBySlug(slug);
        }
      };
      emailInput.addEventListener('blur', handler);
      return () => emailInput.removeEventListener('blur', handler);
    };
    detectCompany();
  }, [loadThemeBySlug]);

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    setLoading(true);
    try {
      const res = await loginService(data);
      saveAuth(res);
      const domain = data.email.split('@')[1];
      if (domain) {
        const slug = domain.split('.')[0];
        await loadThemeBySlug(slug);
      }
      navigate('/dashboard');
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
    if (forgotPassword2.length < 7) {
      setForgotError('La contraseña debe tener al menos 7 caracteres');
      return;
    }
    setForgotLoading(true);
    try {
      await forgotPassword({ email: forgotEmail, newPassword: forgotPassword2 });
      setForgotMsg('Contraseña actualizada. Ya puedes iniciar sesión.');
      setForgotEmail('');
      setForgotPassword2('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al actualizar contraseña';
      setForgotError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <img src={theme.logoUrl || '/resources/logo-gemeseg-back-white.png'} alt={theme.name} className="auth-logo" />
          <h1>{showForgot ? 'Recuperar contraseña' : 'Iniciar sesión'}</h1>
          <p className="auth-subtitle">
            {showForgot
              ? 'Ingresa tu correo y la nueva contraseña'
              : 'Ingresa con tu correo corporativo para acceder al sistema'}
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
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="forgot-password">Nueva contraseña</label>
                <input
                  id="forgot-password"
                  type="password"
                  placeholder="Mínimo 7 caracteres"
                  value={forgotPassword2}
                  onChange={(e) => setForgotPassword2(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="auth-btn" disabled={forgotLoading}>
                {forgotLoading ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </form>

            <div className="auth-footer">
              <span
                onClick={() => { setShowForgot(false); setForgotMsg(''); setForgotError(''); }}
                className="auth-link"
                style={{ cursor: 'pointer' }}
              >
                Volver al inicio de sesión
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
