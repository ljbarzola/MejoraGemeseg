import { useState } from 'react';

interface PromptDialogProps {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'number';
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

// Reemplazo de window.prompt: mismo motivo que ConfirmDialog (ver ese
// archivo) — nunca usar diálogos nativos del navegador.
export default function PromptDialog({
  title = 'Ingresa un valor',
  message,
  defaultValue = '',
  placeholder,
  inputType = 'text',
  confirmLabel = 'Continuar',
  cancelLabel = 'Cancelar',
  required = false,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  const handleConfirm = () => {
    if (required && !value.trim()) return;
    onConfirm(value);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 12px', color: '#2d3748', lineHeight: 1.5 }}>{message}</p>
          <input
            type={inputType}
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button onClick={handleConfirm} className="auth-btn" disabled={required && !value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
