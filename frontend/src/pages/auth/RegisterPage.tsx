import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import {
  register as registerService,
  saveAuth,
} from '../../services/auth.service';
import { useCompany } from '../../contexts/ThemeContext';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'El nombre es requerido'),
    lastName: z.string().min(1, 'El apellido es requerido'),
    email: z
      .string()
      .min(1, 'El correo es requerido')
      .email('Formato de correo inválido'),
    password: z
      .string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { theme, loadThemeBySlug } = useCompany();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detectedCompany, setDetectedCompany] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  useEffect(() => {
    const emailInput = document.getElementById('reg-email') as HTMLInputElement;
    if (!emailInput) return;
    const handler = async () => {
      const email = emailInput.value;
      const domain = email.split('@')[1];
      if (domain) {
        const slug = domain.split('.')[0];
        await loadThemeBySlug(slug);
        setDetectedCompany(true);
      }
    };
    emailInput.addEventListener('blur', handler);
    return () => emailInput.removeEventListener('blur', handler);
  }, [loadThemeBySlug]);

  const onSubmit = async (data: RegisterForm) => {
    setServerError('');
    setLoading(true);
    try {
      const res = await registerService({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      });
      saveAuth(res);
      navigate('/dashboard');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Error al registrarse';
      setServerError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  };

  const domainHint = theme.domain || '@gemeseg.com';

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
              background: 'linear-gradient(135deg, #100F31, #12375F)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <span style={{ fontSize: '28px', color: 'white', fontWeight: 800 }}>G</span>
            </div>
          )}
          <h1>Crear cuenta</h1>
          <p className="auth-subtitle">
            Regístrate con tu correo corporativo {domainHint}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {serverError && (
            <div className="auth-error-banner">{serverError}</div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">Nombre</label>
              <input
                id="firstName"
                type="text"
                placeholder="Juan"
                {...register('firstName')}
                className={errors.firstName ? 'input-error' : ''}
              />
              {errors.firstName && (
                <span className="field-error">
                  {errors.firstName.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Apellido</label>
              <input
                id="lastName"
                type="text"
                placeholder="Pérez"
                {...register('lastName')}
                className={errors.lastName ? 'input-error' : ''}
              />
              {errors.lastName && (
                <span className="field-error">
                  {errors.lastName.message}
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Correo electrónico</label>
              <input
                id="reg-email"
                type="email"
              placeholder={`tu@${domainHint.replace('@', '')}`}
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

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Repite tu contraseña"
              {...register('confirmPassword')}
              className={errors.confirmPassword ? 'input-error' : ''}
            />
            {errors.confirmPassword && (
              <span className="field-error">
                {errors.confirmPassword.message}
              </span>
            )}
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="auth-footer">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="auth-link">
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
