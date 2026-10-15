import { AlertTriangle } from 'lucide-react';
import type { PriceChange } from '../../../utils/cotizador/pricing';
import { money } from '../../../utils/cotizador/format';

interface Props {
  changes: PriceChange[];
  /** La cotización se puede editar (si es de solo lectura no se ofrece cambiar de precios). */
  canEdit: boolean;
  onKeep: () => void;
  onUseCurrent: () => void;
}

// Aviso al abrir una cotización guardada cuyos productos hoy tienen otro precio en el catálogo.
export default function PriceChangesModal({ changes, canEdit, onKeep, onUseCurrent }: Props) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div
        className="modal modal-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-pc-title"
      >
        <div className="modal-header">
          <h3 id="cot-pc-title">
            <AlertTriangle size={18} style={{ verticalAlign: '-3px', color: '#dd6b20' }} /> Los precios cambiaron
          </h3>
          <button className="modal-close" onClick={onKeep} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="cot-muted" style={{ marginTop: 0, fontSize: 13 }}>
            Esta cotización conserva los precios con los que se hizo. Estos productos hoy tienen otro precio en el
            catálogo:
          </p>
          <div className="cot-table-wrap">
            <table className="cot-changes-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="num">Costo cuando cotizaste</th>
                  <th className="num">Costo actual</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.code}>
                    <td className="cot-mono" style={{ fontSize: 11 }}>
                      {c.code}
                    </td>
                    <td>{c.name}</td>
                    <td className="num">{money(c.frozenCost)}</td>
                    <td
                      className="num"
                      style={{ fontWeight: 700, color: c.currentCost > c.frozenCost ? '#c53030' : '#2f855a' }}
                    >
                      {money(c.currentCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onKeep}>
            Entendido, mantener precios de la cotización
          </button>
          {canEdit && (
            <button className="auth-btn" onClick={onUseCurrent}>
              Usar precios actuales
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
