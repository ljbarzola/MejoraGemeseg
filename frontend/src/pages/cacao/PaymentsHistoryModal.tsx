import { useState } from 'react';
import MotivoDialog from './MotivoDialog';
import ErrorBanner from '../../components/common/ErrorBanner';
import { apiErrorMessage, formatDateEc, formatMoney, PAYMENT_METHOD_LABEL } from './utils';

interface Props {
  title: string;
  /** 'pago' para cuentas por pagar, 'cobro' para cuentas por cobrar. */
  noun: 'pago' | 'cobro';
  payments: any[];
  canVoid: boolean;
  onVoid: (paymentId: number, reason: string) => Promise<void>;
  onClose: () => void;
}

/** Movimientos de una cuenta por pagar o por cobrar, con la opción de anular uno registrado por error. */
export default function PaymentsHistoryModal({ title, noun, payments, canVoid, onVoid, onClose }: Props) {
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function handleVoid(reason: string) {
    if (voidingId == null) return;
    setError('');
    try {
      await onVoid(voidingId, reason);
    } catch (err: any) {
      setError(apiErrorMessage(err, `No se pudo anular el ${noun}.`));
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {payments.length === 0 ? (
            <div className="empty-state">No hay movimientos registrados.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Método</th>
                    <th>Referencia</th>
                    <th>Estado</th>
                    {canVoid && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const anulado = !!p.voidedAt;
                    return (
                      <tr key={p.id} style={anulado ? { color: '#a0aec0' } : undefined}>
                        <td>{formatDateEc(p.createdAt)}</td>
                        <td style={anulado ? { textDecoration: 'line-through' } : { fontWeight: 600 }}>{formatMoney(p.amount)}</td>
                        <td>{PAYMENT_METHOD_LABEL[p.method] || p.method}</td>
                        <td>{p.reference || '—'}</td>
                        <td>
                          {anulado ? (
                            <span title={p.voidReason || undefined}>Anulado{p.voidReason ? `: ${p.voidReason}` : ''}</span>
                          ) : 'Vigente'}
                        </td>
                        {canVoid && (
                          <td>
                            {!anulado && (
                              <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => setVoidingId(p.id)}>Anular</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {voidingId != null && (
        <MotivoDialog
          tipo="PAGO"
          title={`Anular ${noun}`}
          message={`Indica el motivo. La cuenta recupera el saldo de este ${noun}.`}
          confirmLabel="Anular"
          onCancel={() => setVoidingId(null)}
          onConfirm={handleVoid}
        />
      )}
    </div>
  );
}
