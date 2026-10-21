import { lazy, Suspense, useState } from 'react';
import type { UbicacionOportunidad } from '../../services/ventas.service';

// El mapa (Leaflet) pesa: solo se descarga cuando alguien abre el cuadro.
const UbicacionModal = lazy(() => import('./UbicacionModal'));

interface Props {
  value: UbicacionOportunidad | null;
  onChange: (u: UbicacionOportunidad | null) => void;
  // Texto con el que arranca la búsqueda (por ejemplo, la dirección que trajo el posible cliente).
  busquedaInicial?: string;
}

// Campo «Ubicación (opcional)» de una oportunidad: muestra el lugar elegido y abre el mapa para elegir,
// cambiar o quitar. Nunca es obligatorio: mucha gente no tiene el lugar a la mano al empezar.
export default function UbicacionCampo({ value, onChange, busquedaInicial }: Props) {
  const [abierto, setAbierto] = useState(false);
  const detalle = value ? [value.city, value.province].filter(Boolean).join(' · ') : '';

  return (
    <div className="form-group">
      <label>Ubicación del servicio (opcional)</label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1.2 }}>📍</span>
          <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
            <strong>{value.name ?? value.address ?? 'Punto marcado en el mapa'}</strong>
            {value.name && value.address && <span style={{ display: 'block', color: '#718096', fontSize: 12 }}>{value.address}</span>}
            {detalle && <span style={{ display: 'block', color: '#a0aec0', fontSize: 12 }}>{detalle}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setAbierto(true)}>Cambiar</button>
            <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => onChange(null)}>Quitar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setAbierto(true)} style={{ alignSelf: 'flex-start' }}>
          📍 Elegir en el mapa
        </button>
      )}
      <small style={{ color: '#a0aec0' }}>
        Sirve para ver en el Dashboard qué zonas del país se están cotizando. Puedes dejarla vacía y ponerla después.
      </small>
      {abierto && (
        <Suspense fallback={null}>
          <UbicacionModal
            inicial={value}
            busquedaInicial={busquedaInicial}
            onClose={() => setAbierto(false)}
            onConfirm={(u) => { onChange(u); setAbierto(false); }}
          />
        </Suspense>
      )}
    </div>
  );
}
