import { useState, useEffect } from 'react';

interface MissingType {
  documentTypeId: number;
  type: string;
}

interface Props {
  open: boolean;
  fileName?: string | null;
  missingTypes: MissingType[];
  saving?: boolean;
  error?: string;
  /** Asigna `documentTypeId` al archivo (renombra en Drive) Y lo aprueba bajo ese tipo, en un solo paso. */
  onAssignAndApprove: (documentTypeId: number) => void;
  /** Aprueba el archivo tal cual, sin asociarlo a ningún tipo de documento requerido. */
  onApproveWithoutType: () => void;
  /** Aprueba el archivo como documento adicional, renombrándolo con el nombre que RRHH elija. */
  onApproveAsAdditional: (label: string) => void;
  onClose: () => void;
}

/**
 * Reemplaza el viejo flujo de "Aprobar" (sin tipo) + "Asignar tipo" (sin
 * aprobar) como dos acciones sueltas para un archivo no reconocido
 * (compliance.unmatchedFiles) — ver ComplianceChecklist.tsx. Un solo clic en
 * "Aprobar" abre este modal; RRHH decide en un solo paso si el archivo es en
 * realidad un documento requerido (se renombra en Drive Y queda aprobado bajo
 * ese tipo) o si se aprueba sin asociarlo a ningún tipo.
 * Mismo estilo visual que DocumentReviewModal.tsx.
 */
export default function AssignOrApproveModal({
  open,
  fileName,
  missingTypes,
  saving,
  error,
  onAssignAndApprove,
  onApproveWithoutType,
  onApproveAsAdditional,
  onClose,
}: Props) {
  const [selected, setSelected] = useState('');
  const [additionalLabel, setAdditionalLabel] = useState('');

  useEffect(() => {
    if (open) {
      setSelected('');
      setAdditionalLabel('');
    }
  }, [open]);

  if (!open) return null;

  const hasMissingTypes = missingTypes.length > 0;

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
        <h3 style={{ margin: '0 0 4px', color: 'var(--azul-oscuro)' }}>Aprobar archivo</h3>
        {fileName && (
          <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#a0aec0' }}>📄 {fileName}</p>
        )}

        {error && (
          <div className="form-error" style={{ fontSize: '0.78rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {hasMissingTypes ? (
          <>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)', marginBottom: '6px' }}>
              ¿Es en realidad uno de los documentos requeridos que faltan?
            </label>
            <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#718096' }}>
              Si lo eliges, el archivo se renombra en Drive para que quede bajo ese tipo Y se aprueba de una vez.
            </p>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={saving}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '6px',
                border: '1px solid #cbd5e0', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: '10px',
              }}
            >
              <option value="">Selecciona un tipo de documento...</option>
              {missingTypes.map((t) => (
                <option key={t.documentTypeId} value={t.documentTypeId}>{t.type}</option>
              ))}
            </select>
            <button
              type="button"
              className="auth-btn"
              disabled={!selected || saving}
              onClick={() => selected && onAssignAndApprove(Number(selected))}
              style={{ width: '100%', opacity: !selected || saving ? 0.6 : 1, marginBottom: '16px' }}
            >
              {saving ? 'Guardando...' : 'Asignar tipo y aprobar'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 16px', color: '#a0aec0', fontSize: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              o
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>
          </>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#718096' }}>
            No hay documentos requeridos pendientes para asociar este archivo — solo puedes aprobarlo sin asignarle un tipo.
          </p>
        )}

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)', marginBottom: '6px' }}>
          ¿Es un documento adicional? Dale un nombre
        </label>
        <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#718096' }}>
          Se renombra el archivo en Drive con el nombre que escribas y queda aprobado como documento adicional (no cuenta como uno de los requeridos).
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            value={additionalLabel}
            onChange={(e) => setAdditionalLabel(e.target.value)}
            disabled={saving}
            placeholder="Ej. Constancia de estudios"
            style={{
              flex: 1, padding: '8px 10px', borderRadius: '6px',
              border: '1px solid #cbd5e0', fontSize: '0.85rem', boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={!additionalLabel.trim() || saving}
            onClick={() => onApproveAsAdditional(additionalLabel.trim())}
            style={{ opacity: !additionalLabel.trim() || saving ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {saving ? 'Guardando...' : 'Aprobar como adicional'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="btn-secondary"
            onClick={onApproveWithoutType}
            disabled={saving}
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Guardando...' : 'Aprobar sin renombrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
