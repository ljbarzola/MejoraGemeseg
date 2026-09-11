import { useState, useEffect } from 'react';

const MIN_REASON = 5;

const SUGERENCIAS = [
  'Documento ilegible',
  'Documento caducado',
  'No corresponde al tipo solicitado',
  'Falta firma o sello',
];

interface Props {
  open: boolean;
  documentType: string;
  fileName?: string | null;
  saving?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export default function DocumentReviewModal({ open, documentType, fileName, saving, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const tooShort = reason.trim().length < MIN_REASON;

  const handleConfirm = () => {
    setTouched(true);
    if (tooShort) return;
    onConfirm(reason.trim());
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px',
      }}
    >
      <div
        className="admin-section"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', margin: 0 }}
      >
        <h3 style={{ margin: '0 0 4px', color: 'var(--azul-oscuro)' }}>Rechazar documento</h3>
        <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#718096' }}>{documentType}</p>
        {fileName && (
          <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#a0aec0' }}>📄 {fileName}</p>
        )}

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)', marginBottom: '6px' }}>
          Motivo del rechazo <span style={{ color: '#c53030' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={4}
          autoFocus
          placeholder="Explica por qué se rechaza, para que la persona sepa qué corregir."
          style={{
            width: '100%', padding: '8px 10px', borderRadius: '6px',
            border: `1px solid ${touched && tooShort ? '#feb2b2' : '#cbd5e0'}`,
            fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        {touched && tooShort && (
          <div className="form-error" style={{ fontSize: '0.78rem', marginTop: '4px' }}>
            El motivo es obligatorio (mínimo {MIN_REASON} caracteres).
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReason(s)}
              style={{
                padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer',
                border: '1px solid #e2e8f0', background: '#f7fafc', color: '#4a5568',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button className="cacao-back-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="auth-btn"
            onClick={handleConfirm}
            disabled={saving || tooShort}
            style={{ background: '#c53030', opacity: saving || tooShort ? 0.6 : 1 }}
          >
            {saving ? 'Guardando...' : 'Confirmar rechazo'}
          </button>
        </div>
      </div>
    </div>
  );
}
