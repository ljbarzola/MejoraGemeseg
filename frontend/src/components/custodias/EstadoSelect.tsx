import { useState } from 'react';
import { updateCustodiaEstado } from '../../services/custodia.service';

const ESTADOS = [
  { value: 'LISTO_PARA_CUSTODIAR', label: 'LISTO PARA CUSTODIAR', color: '#eab308' },
  { value: 'EN_CAMINO', label: 'EN CAMINO', color: '#3b82f6' },
  { value: 'LLEGO', label: 'LLEGÓ', color: '#22c55e' },
];

interface Props {
  custodiaId: number;
  estadoActual: string;
  onUpdated?: () => void;
}

export default function EstadoSelect({ custodiaId, estadoActual, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleChange(nuevoEstado: string) {
    if (nuevoEstado === estadoActual) return;
    setLoading(true);
    try {
      await updateCustodiaEstado(custodiaId, nuevoEstado);
      onUpdated?.();
    } catch {
    } finally {
      setLoading(false);
    }
  }

  const current = ESTADOS.find(e => e.value === estadoActual) || ESTADOS[0];

  return (
    <select
      value={estadoActual}
      onChange={(e) => handleChange(e.target.value)}
      disabled={loading}
      style={{
        padding: '4px 8px',
        borderRadius: '6px',
        border: `2px solid ${current.color}40`,
        backgroundColor: `${current.color}15`,
        color: current.color,
        fontSize: '0.72rem',
        fontWeight: 700,
        cursor: 'pointer',
        minWidth: '140px',
      }}
    >
      {ESTADOS.map(e => (
        <option key={e.value} value={e.value}>{e.label}</option>
      ))}
    </select>
  );
}
