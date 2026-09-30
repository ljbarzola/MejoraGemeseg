import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title?: string;
  // Texto plano (uso histórico) o contenido enriquecido (ej. una lista
  // concreta de registros bloqueantes) — todos los usos existentes siguen
  // funcionando igual porque un string también es un ReactNode válido.
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // true para un aviso informativo de un solo botón (sin opción de "Cancelar")
  hideCancel?: boolean;
}

// Reemplazo de window.confirm: en el navegador esos diálogos nativos quedan
// fuera del control de estilos/idioma de la app y en algunos entornos ni
// siquiera se muestran (popup bloqueado) — este modal replica el mismo
// patrón visual (modal-overlay/modal) que ya usa el resto del módulo.
export default function ConfirmDialog({
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Continuar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
  hideCancel = false,
}: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {danger && <AlertTriangle size={18} color="#c53030" />}
            {title}
          </h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div className="modal-actions">
          {!hideCancel && (
            <button onClick={onCancel} className="btn-secondary">
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="auth-btn"
            style={danger ? { background: '#c53030', borderColor: '#c53030' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
