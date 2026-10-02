import { useState } from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Texto bajo el total, en el centro (ej. "tickets"). */
  centerLabel: string;
}

const SIZE = 132;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
// Hueco entre segmentos, del color del fondo (regla de marcas del skill dataviz).
const GAP = 2;

/**
 * Dona SVG con leyenda. La leyenda lleva nombre, cantidad y porcentaje, así el
 * color no es la única señal (hace también de tabla de lectura). Al pasar el
 * cursor por un segmento o por su fila, el centro muestra ese dato.
 * No usa ninguna librería de gráficos: el proyecto no tiene una instalada.
 */
export default function DonutChart({ segments, centerLabel }: DonutChartProps) {
  const [activo, setActivo] = useState<string | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);

  if (total === 0) {
    return <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Todavía no hay tickets.</p>;
  }

  const pct = (v: number) => Math.round((v / total) * 100);
  const resumen = segments.map((s) => `${s.label}: ${s.value} (${pct(s.value)}%)`).join(', ');
  const seleccionado = segments.find((s) => s.key === activo);

  // Un solo segmento ocupa toda la dona: sin hueco, que no hay con quién separarlo.
  const conDatos = segments.filter((s) => s.value > 0);
  const hueco = conDatos.length > 1 ? GAP : 0;
  let acumulado = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Tickets por tipo. ${resumen}`}
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {conDatos.map((s) => {
              const largo = (s.value / total) * CIRC;
              const offset = -acumulado;
              acumulado += largo;
              return (
                <circle
                  key={s.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${Math.max(largo - hueco, 0.5)} ${CIRC}`}
                  strokeDashoffset={offset}
                  opacity={activo && activo !== s.key ? 0.35 : 1}
                  style={{ transition: 'opacity 0.15s', cursor: 'default' }}
                  onMouseEnter={() => setActivo(s.key)}
                  onMouseLeave={() => setActivo(null)}
                >
                  <title>{`${s.label}: ${s.value} (${pct(s.value)}%)`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--azul-oscuro)', lineHeight: 1.1 }}>
            {seleccionado ? seleccionado.value : total}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#718096', maxWidth: '70px' }}>
            {seleccionado ? seleccionado.label : centerLabel}
          </span>
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '170px' }}>
        {segments.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setActivo(s.key)}
            onMouseLeave={() => setActivo(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#4a5568',
              opacity: activo && activo !== s.key ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <strong style={{ color: 'var(--azul-oscuro)' }}>{s.value}</strong>
            <span style={{ width: '38px', textAlign: 'right', color: '#718096' }}>{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
