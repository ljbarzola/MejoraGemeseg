interface Props {
  quoteNumber: string;
  /** Puedes actualizar la cotización que ya existe con ese número (si no, solo se ofrece crear una nueva). */
  canUpdate: boolean;
  onChoose: (action: 'update' | 'create_new' | null) => void;
}

// "Ya existe esa cotización": actualizarla o guardar esta como nueva (igual que el cotizador original).
export default function DuplicateQuoteModal({ quoteNumber, canUpdate, onChoose }: Props) {
  return (
    <div className="modal-overlay" onClick={() => onChoose(null)}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-dup-title"
      >
        <div className="modal-header">
          <h3 id="cot-dup-title">Cotización existente</h3>
          <button className="modal-close" onClick={() => onChoose(null)} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0 }}>
            Ya existe <strong>{quoteNumber}</strong>. ¿Qué deseas hacer?
          </p>
          {!canUpdate && (
            <p className="cot-muted" style={{ marginBottom: 0 }}>
              No tienes permiso para modificar esa cotización, así que solo puedes guardar esta como una cotización
              nueva.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => onChoose(null)}>
            Cancelar
          </button>
          <button className="btn-secondary" onClick={() => onChoose('create_new')}>
            Crear como nueva
          </button>
          {canUpdate && (
            <button className="auth-btn" onClick={() => onChoose('update')}>
              Actualizar existente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
