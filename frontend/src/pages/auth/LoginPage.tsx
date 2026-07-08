import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { login as loginService, saveAuth } from '../../services/auth.service';

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
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    setLoading(true);
    try {
      const res = await loginService(data);
      saveAuth(res);
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

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <img src="/resources/logo-gemeseg-back-white.png" alt="GEMESEG" className="auth-logo" />
          <h1>Iniciar sesión</h1>
          <p className="auth-subtitle">
            Ingresa con tu correo corporativo para acceder al sistema
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {serverError && (
            <div className="auth-error-banner">{serverError}</div>
          )}

          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              placeholder="tu@ gemeseg.com"
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
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="auth-link">
            Regístrate aquí
          </Link>
        </div>
      </div>
    </div>
  );
}
