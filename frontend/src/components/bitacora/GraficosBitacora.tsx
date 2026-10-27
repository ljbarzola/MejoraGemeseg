import { SinDatos } from '../ventas/dashboard/DashboardBits';

export interface SerieBarras {
  nombre: string;
  color: string;
}

export interface DatoBarras {
  etiqueta: string;
  /** Un valor por serie, en el mismo orden (si hay varias series se apilan). */
  valores: number[];
}

// Un lienzo angosto (cercano al ancho real de una tarjeta) para que el texto se vea a tamaño legible y no se reduzca.
const ANCHO = 380;
const ALTO = 190;
const MARGEN = { izq: 28, der: 6, arriba: 10, abajo: 24 };

/**
 * Máximo «redondo» y PAR para el eje, para que la marca del medio también sea un número entero (nadie tiene
 * «1,5 personas»): 1 → 2, 3 → 4, 13 → 16, 36 → 40, 130 → 150.
 */
function maximoRedondo(max: number): number {
  let base = Math.max(max, 1);
  if (max > 4) {
    const paso = 10 ** Math.floor(Math.log10(max)) / 2;
    base = Math.ceil(max / paso) * paso;
  }
  return base % 2 === 0 ? base : base + 1;
}

/**
 * Barras verticales dibujadas a mano (sin librería, como los demás gráficos del sistema). Con varias series
 * se apilan. Cada barra lleva su cifra al pasar el mouse. `cadaEtiqueta` deja un rótulo de cada N barras para
 * que no se amontonen.
 */
export function BarrasVerticales({
  datos,
  series,
  aria,
  cadaEtiqueta = 1,
  vacio = 'Todavía no hay datos en este período.',
}: {
  datos: DatoBarras[];
  series: SerieBarras[];
  aria: string;
  cadaEtiqueta?: number;
  vacio?: string;
}) {
  const totales = datos.map((d) => d.valores.reduce((a, b) => a + b, 0));
  const max = Math.max(0, ...totales);
  if (max === 0) return <SinDatos texto={vacio} />;

  const tope = maximoRedondo(max);
  const ancho = ANCHO - MARGEN.izq - MARGEN.der;
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = ancho / datos.length;
  const barra = Math.min(36, paso * 0.68);
  const y = (v: number) => MARGEN.arriba + alto - (v / tope) * alto;
  const marcas = [0, tope / 2, tope];

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" role="img" aria-label={aria} style={{ display: 'block' }}>
      {marcas.map((m) => (
        <g key={m}>
          <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={y(m)} y2={y(m)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={MARGEN.izq - 6} y={y(m) + 4} textAnchor="end" fontSize={12} fill="#718096">
            {Number.isInteger(m) ? m : m.toFixed(1)}
          </text>
        </g>
      ))}
      {datos.map((d, i) => {
        const x = MARGEN.izq + paso * i + (paso - barra) / 2;
        let acumulado = 0;
        return (
          <g key={`${d.etiqueta}-${i}`}>
            <title>
              {d.etiqueta}: {series.length > 1 ? d.valores.map((v, k) => `${series[k].nombre} ${v}`).join(' · ') : d.valores[0]}
            </title>
            {d.valores.map((v, k) => {
              if (v <= 0) return null;
              const desde = acumulado;
              acumulado += v;
              return (
                <rect
                  key={series[k].nombre}
                  x={x}
                  width={barra}
                  y={y(acumulado)}
                  height={y(desde) - y(acumulado)}
                  fill={series[k].color}
                  rx={2}
                />
              );
            })}
            {i % cadaEtiqueta === 0 && (
              <text x={x + barra / 2} y={ALTO - 6} textAnchor="middle" fontSize={12} fill="#718096">
                {d.etiqueta}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Leyenda de las series de un gráfico. */
export function LeyendaSeries({ series }: { series: SerieBarras[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#4a5568' }}>
      {series.map((s) => (
        <span key={s.nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
          {s.nombre}
        </span>
      ))}
    </div>
  );
}
