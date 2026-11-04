import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Aviso corto para una pantalla de la que SALIÓ una opción y ahora vive en la Configuración del módulo
 * (2026-10-30). Quien la buscaba en el botón de siempre encuentra aquí dónde quedó, con un enlace directo
 * a la pestaña. Es una sola línea: qué se movió y adónde. Se queda fijo (no se cierra) mientras la gente
 * se acostumbra al cambio.
 *
 * `to` es la ruta de la Configuración, con `?pestana=` si hay una pestaña concreta.
 */
export default function MovidoAConfiguracion({
  to,
  enlace = 'Ir a Configuración',
  children,
}: {
  to: string;
  enlace?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="note"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px',
        background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px',
        padding: '8px 14px', margin: '12px 0', fontSize: '0.82rem', color: '#2a4365',
      }}
    >
      <Settings size={15} aria-hidden="true" style={{ flex: 'none', color: '#2b6cb0' }} />
      <span>{children}</span>
      <button
        type="button"
        onClick={() => navigate(to)}
        style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
      >
        {enlace} →
      </button>
    </div>
  );
}
