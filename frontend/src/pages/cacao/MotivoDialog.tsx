import { useEffect, useState } from 'react';
import { getCacaoMotivos, type TipoMotivo } from '../../services/cacao.service';
import PromptDialog from '../../components/common/PromptDialog';

interface MotivoDialogProps {
  /** Qué catálogo de motivos usar: el de liquidaciones o el de pagos y cobros. */
  tipo: TipoMotivo;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}

/**
 * Pide el motivo de un rechazo o una anulación. Si la empresa armó su catálogo (Cacao →
 * Configuración → Motivos) se elige de ahí, con un detalle opcional; mientras no tenga ninguno, o si no
 * se pudo cargar, se escribe a mano como siempre. El servidor guarda el motivo como texto, así que
 * lo registrado no cambia si el catálogo cambia después.
 */
export default function MotivoDialog({ tipo, title, message, confirmLabel, onConfirm, onCancel }: MotivoDialogProps) {
  const [motivos, setMotivos] = useState<{ id: number; nombre: string }[] | null>(null);
  const [elegido, setElegido] = useState('');
  const [detalle, setDetalle] = useState('');

  useEffect(() => {
    let vigente = true;
    getCacaoMotivos(tipo)
      .then((lista) => { if (vigente) setMotivos(lista); })
      .catch(() => { if (vigente) setMotivos([]); });
    return () => { vigente = false; };
  }, [tipo]);

  if (motivos === null) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1100 }}>
        <div className="modal" style={{ maxWidth: '440px' }}>
          <div className="modal-body"><div className="loading-state">Cargando motivos...</div></div>
        </div>
      </div>
    );
  }

  // Sin catálogo: texto libre, igual que antes.
  if (motivos.length === 0) {
    return <PromptDialog title={title} message={message} confirmLabel={confirmLabel} required onCancel={onCancel} onConfirm={onConfirm} />;
  }

  const confirmar = () => {
    if (!elegido) return;
    const extra = detalle.trim();
    onConfirm(extra ? `${elegido}: ${extra}` : elegido);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 12px', color: '#2d3748', lineHeight: 1.5 }}>{message}</p>
          <div className="form-group">
            <label htmlFor="mot-1">Motivo *</label>
            <select id="mot-1" value={elegido} onChange={(e) => setElegido(e.target.value)} autoFocus>
              <option value="">Selecciona un motivo...</option>
              {motivos.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="mot-2">Detalle (opcional)</label>
            <input id="mot-2" type="text" maxLength={300} value={detalle} onChange={(e) => setDetalle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} placeholder="Algo que quieras dejar anotado" />
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button onClick={confirmar} className="auth-btn" disabled={!elegido}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
