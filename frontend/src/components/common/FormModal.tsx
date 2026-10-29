import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import ErrorBanner from './ErrorBanner';

interface FormModalProps {
  title: string;
  /** Una frase bajo el título que explica para qué sirve lo que se va a guardar. */
  descripcion?: string;
  onClose: () => void;
  /** Se llama al pulsar el botón principal o la tecla Enter dentro de un campo. */
  onSubmit: () => void;
  submitLabel?: string;
  saving?: boolean;
  /** Error ya traducido a un mensaje corto; se muestra arriba y se trae a la vista. */
  error?: string;
  /** Ancho máximo del cuadro en px (por defecto 520). */
  ancho?: number;
  children: ReactNode;
}

/**
 * Ventana para CREAR o EDITAR un registro sin salir de la lista (2026-10-28): antes cada pantalla de
 * Cacao abría un formulario suelto encima de la tabla, que empujaba el listado hacia abajo y dejaba
 * el error fuera de pantalla. Aquí el foco cae en el primer campo, Enter guarda, Escape cierra y el
 * error aparece dentro de la ventana. Los campos van dentro como `.form-group` / `.form-row`.
 */
export default function FormModal({
  title, descripcion, onClose, onSubmit, submitLabel = 'Guardar', saving = false, error = '', ancho = 520, children,
}: FormModalProps) {
  const titleId = useId();
  const cuerpoRef = useRef<HTMLDivElement>(null);

  // El primer campo editable recibe el foco para poder escribir de inmediato.
  useEffect(() => {
    cuerpoRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, saving]);

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) onSubmit();
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="modal" style={{ maxWidth: ancho }} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={alEnviar} noValidate>
          <div className="modal-header">
            <h3 id={titleId}>{title}</h3>
            <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body" ref={cuerpoRef}>
            {descripcion && <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>{descripcion}</p>}
            <ErrorBanner mensaje={error} />
            {children}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando…' : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
