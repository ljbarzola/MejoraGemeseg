import { ESTADO_CONTRATO_LABEL, ESTADO_CONTRATO_COLOR, type EstadoContrato } from '../../services/ventas.service';

export default function EstadoContratoBadge({ estado }: { estado: EstadoContrato }) {
  const color = ESTADO_CONTRATO_COLOR[estado];
  return (
    <span className="status-badge" style={{ backgroundColor: color + '22', color, whiteSpace: 'nowrap' }}>
      {ESTADO_CONTRATO_LABEL[estado]}
    </span>
  );
}
