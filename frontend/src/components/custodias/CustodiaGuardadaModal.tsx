import { CheckCircle2 } from 'lucide-react';

interface Props {
  numeroGuia: string;
  /** Baja el PDF de la orden como archivo; nunca abre el cuadro de impresión. */
  onDescargar: () => void;
  onCerrar: () => void;
}

/** Aviso al guardar un viaje nuevo: confirma el número que se le asignó y ofrece bajar su orden en PDF. */
export default function CustodiaGuardadaModal({ numeroGuia, onDescargar, onCerrar }: Props) {
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-ventas-sm" role="dialog" aria-modal="true" aria-label="Custodia guardada" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Custodia guardada</h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <CheckCircle2 size={40} color="#2f855a" aria-hidden />
          <p style={{ margin: '10px 0 0', color: '#4a5568', fontSize: '0.95rem' }}>
            La guía <strong>{numeroGuia}</strong> quedó guardada.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          <button type="button" className="auth-btn" onClick={onDescargar}>Descargar PDF</button>
        </div>
      </div>
    </div>
  );
}
