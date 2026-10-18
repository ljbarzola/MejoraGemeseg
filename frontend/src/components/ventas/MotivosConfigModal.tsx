import { usePerm } from '../../contexts/PermissionsContext';
import MotivosCatalogo from './MotivosCatalogo';
import type { GrupoMotivoClave } from '../../utils/motivosCierre';

// Atajo a los motivos desde la pantalla donde se piden. El catálogo completo, con
// los tres niveles (posible cliente, oportunidad y contrato), está en Ventas →
// Configuración → Motivos de cierre.
export default function MotivosConfigModal({ onClose, grupos, titulo = 'Motivos de cierre' }: {
  onClose: () => void;
  grupos?: GrupoMotivoClave[];
  titulo?: string;
}) {
  const { canWrite } = usePerm();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Las opciones que se ofrecen al cerrar. Si un motivo ya se usó no se borra: se desactiva para que deje de ofrecerse sin perder lo registrado.
            {' '}Todos los motivos (posibles clientes, oportunidades y contratos) se administran en Ventas → Configuración.
          </p>
          <MotivosCatalogo grupos={grupos} puedeEditar={canWrite('VENTAS')} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
