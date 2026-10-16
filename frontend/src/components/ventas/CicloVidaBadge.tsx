import { CICLO_COLOR, CICLO_LABEL, type CicloVida } from '../../services/ventas.service';

// Ciclo de vida del cliente (Prospecto, Cliente, En riesgo, Inactivo, Perdido).
// Es un cálculo, no algo que se teclee: `razones` explica por qué está en riesgo.
export default function CicloVidaBadge({
  ciclo,
  razones,
}: {
  ciclo?: CicloVida | null;
  razones?: string[];
}) {
  if (!ciclo) return <span style={{ color: '#a0aec0' }}>—</span>;
  const color = CICLO_COLOR[ciclo];
  return (
    <span
      className="status-badge"
      title={razones && razones.length ? razones.join(' · ') : undefined}
      style={{ backgroundColor: color + '22', color, whiteSpace: 'nowrap' }}
    >
      {CICLO_LABEL[ciclo]}
    </span>
  );
}
