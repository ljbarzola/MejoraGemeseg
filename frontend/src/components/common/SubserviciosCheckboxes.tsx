import { parseSubservicios } from '../../services/ventas.service';

interface Props {
  // Sub-servicios del servicio elegido (children de su opción).
  options: { key: string; label: string }[];
  // Keys marcadas, separadas por coma (formato de extra.subservicios_requeridos).
  value: string;
  onChange: (value: string) => void;
}

// Casillas de "Sub-servicios": siempre opcionales, se pueden marcar varias.
// No renderiza nada si el servicio elegido no tiene sub-servicios.
export default function SubserviciosCheckboxes({ options, value, onChange }: Props) {
  if (options.length === 0) return null;
  const marcadas = parseSubservicios(value);

  const toggle = (key: string) => {
    const next = marcadas.includes(key) ? marcadas.filter((k) => k !== key) : [...marcadas, key];
    // Se guarda en el orden de la lista, no en el orden en que se marcaron.
    onChange(options.filter((o) => next.includes(o.key)).map((o) => o.key).join(','));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {options.map((o) => (
        <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={marcadas.includes(o.key)} onChange={() => toggle(o.key)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
