import { useId, type ReactNode } from 'react';

// Gráficos del dashboard de Ventas (2026-10-21). Sin librería de gráficos, a propósito (igual que el resto del
// tablero): SVG a mano, livianos, con los colores de la marca y legibles. Todos aceptan `onClick`
// en sus partes para llevar a la pantalla donde se trabaja eso.

const TINTA = '#100F31';
const SUAVE = '#64748b';
const LINEA = '#e2e8f0';

// ---------------------------------------------------------------------------------------------
// Embudo: cada etapa es un trapecio; su ancho sigue a la cantidad y se une con el de la etapa siguiente.
// ---------------------------------------------------------------------------------------------

export interface PasoEmbudo {
  key: string;
  etiqueta: string;
  /** Número que se escribe dentro de la franja. */
  valor: number;
  /** Con qué se dibuja el ancho de la franja; si falta, con `valor`. Para un embudo que solo se angosta, el acumulado. */
  ancho?: number;
  color: string;
  /** Texto corto a la derecha de la etapa (por ejemplo «68% pasó»). */
  nota?: string;
}

export function EmbudoGrafico({
  pasos, onPaso, aria, etiquetaAncho = 148, notaAncho = 92,
}: { pasos: PasoEmbudo[]; onPaso?: (key: string) => void; aria: string; etiquetaAncho?: number; notaAncho?: number }) {
  const L = etiquetaAncho;  // columna de nombres
  const FW = 330;           // ancho máximo del embudo
  const N = notaAncho;      // columna de notas
  const W = L + FW + N;
  const H_FILA = 46;
  const GAP = 4;
  const MIN_W = 54;
  const base = (p: PasoEmbudo) => p.ancho ?? p.valor;
  const max = Math.max(1, ...pasos.map(base));
  const ancho = (v: number) => MIN_W + (FW - MIN_W) * (v / max);
  const cx = L + FW / 2;
  const alto = pasos.length * (H_FILA + GAP) - GAP;

  return (
    <svg viewBox={`0 0 ${W} ${alto}`} width="100%" role="img" aria-label={aria} style={{ display: 'block', maxHeight: 420 }}>
      {pasos.map((p, i) => {
        const wTop = ancho(base(p));
        const wBot = i < pasos.length - 1 ? ancho(base(pasos[i + 1])) : wTop * 0.8;
        const y = i * (H_FILA + GAP);
        const d = `M ${cx - wTop / 2} ${y} L ${cx + wTop / 2} ${y} L ${cx + wBot / 2} ${y + H_FILA} L ${cx - wBot / 2} ${y + H_FILA} Z`;
        const vacio = p.valor === 0;
        const accion = onPaso ? () => onPaso(p.key) : undefined;
        return (
          <g
            key={p.key}
            role={accion ? 'button' : undefined}
            tabIndex={accion ? 0 : undefined}
            onClick={accion}
            onKeyDown={accion ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accion(); } } : undefined}
            style={{ cursor: accion ? 'pointer' : 'default', outline: 'none' }}
          >
            <title>{`${p.etiqueta}: ${p.valor}`}</title>
            <text x={L - 12} y={y + H_FILA / 2 + 4.5} textAnchor="end" fontSize="13" fontWeight="600" fill={TINTA}>{p.etiqueta}</text>
            <path d={d} fill={p.color} opacity={vacio ? 0.5 : 0.94} />
            <text x={cx} y={y + H_FILA / 2 + 6} textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" opacity={vacio ? 0.9 : 1}>{p.valor}</text>
            {p.nota && <text x={L + FW + 14} y={y + H_FILA / 2 + 4} fontSize="11.5" fill={SUAVE}>{p.nota}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Dona con leyenda
// ---------------------------------------------------------------------------------------------

export interface SegmentoDona {
  key: string;
  etiqueta: string;
  valor: number;
  color: string;
  onClick?: () => void;
}

export function Dona({
  segmentos, centroValor, centroTitulo, aria, vacio = 'Sin datos todavía',
}: { segmentos: SegmentoDona[]; centroValor?: ReactNode; centroTitulo?: string; aria: string; vacio?: string }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const R = 15.9155; // circunferencia = 100
  let acumulado = 0;
  return (
    <div className="dash-dona">
      <div className="dash-dona-aro">
        <svg viewBox="0 0 42 42" role="img" aria-label={aria}>
          <circle cx="21" cy="21" r={R} fill="none" stroke="#eef1f5" strokeWidth="5.2" />
          {total > 0 && segmentos.filter((s) => s.valor > 0).map((s) => {
            const largo = (s.valor / total) * 100;
            const el = (
              <circle
                key={s.key} cx="21" cy="21" r={R} fill="none" stroke={s.color} strokeWidth="5.2"
                strokeDasharray={`${Math.max(0, largo - 0.8)} ${100 - Math.max(0, largo - 0.8)}`}
                strokeDashoffset={25 - acumulado}
              ><title>{`${s.etiqueta}: ${s.valor}`}</title></circle>
            );
            acumulado += largo;
            return el;
          })}
        </svg>
        <div className="dash-dona-centro">
          <strong>{total > 0 ? (centroValor ?? total) : '—'}</strong>
          {centroTitulo && <span>{centroTitulo}</span>}
        </div>
      </div>
      <ul className="dash-leyenda">
        {segmentos.map((s) => {
          const fila = (
            <>
              <i style={{ background: s.color }} />
              <span className="dash-leyenda-t">{s.etiqueta}</span>
              <b>{s.valor}</b>
              <span className="dash-leyenda-p">{total > 0 ? `${Math.round((s.valor / total) * 100)}%` : ''}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.onClick ? <button type="button" onClick={s.onClick}>{fila}</button> : <div>{fila}</div>}
            </li>
          );
        })}
      </ul>
      {total === 0 && <p className="dash-dona-vacio">{vacio}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Medidor (semicírculo) para un porcentaje
// ---------------------------------------------------------------------------------------------

export function Medidor({ valor, color, titulo, aria }: { valor: number | null; color: string; titulo?: ReactNode; aria: string }) {
  const v = valor === null ? 0 : Math.max(0, Math.min(100, valor));
  return (
    <div className="dash-medidor">
      <svg viewBox="0 0 120 70" role="img" aria-label={aria}>
        <path d="M 12 62 A 48 48 0 0 1 108 62" fill="none" stroke="#eef1f5" strokeWidth="11" strokeLinecap="round" pathLength={100} />
        {valor !== null && v > 0 && (
          <path d="M 12 62 A 48 48 0 0 1 108 62" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" pathLength={100} strokeDasharray={`${v} 100`} />
        )}
      </svg>
      <div className="dash-medidor-centro">
        <strong style={{ color: valor === null ? SUAVE : color }}>{valor === null ? '—' : `${valor}%`}</strong>
        {titulo && <span>{titulo}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Área / línea por periodo (por semana)
// ---------------------------------------------------------------------------------------------

export function AreaGrafico({ puntos, color = '#2b6cb0', aria }: { puntos: { etiqueta: string; valor: number }[]; color?: string; aria: string }) {
  const id = useId().replace(/:/g, '');
  const W = 360, H = 130, pl = 26, pr = 10, pt = 14, pb = 24;
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const tope = Math.max(2, Math.ceil(max / 2) * 2);
  const x = (i: number) => (puntos.length <= 1 ? (W + pl - pr) / 2 : pl + (i * (W - pl - pr)) / (puntos.length - 1));
  const y = (v: number) => pt + (1 - v / tope) * (H - pt - pb);
  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const area = puntos.length > 1 ? `${linea} L ${x(puntos.length - 1).toFixed(1)} ${H - pb} L ${x(0).toFixed(1)} ${H - pb} Z` : '';
  const guias = [0, tope / 2, tope];
  const mostrarX = (i: number) => i === 0 || i === puntos.length - 1 || (puntos.length > 4 && i === Math.floor((puntos.length - 1) / 2));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={aria} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {guias.map((g) => (
        <g key={g}>
          <line x1={pl} x2={W - pr} y1={y(g)} y2={y(g)} stroke={LINEA} strokeWidth="1" strokeDasharray={g === 0 ? undefined : '3 4'} />
          <text x={pl - 6} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">{Number.isInteger(g) ? g : ''}</text>
        </g>
      ))}
      {area && <path d={area} fill={`url(#g${id})`} />}
      {puntos.length > 1 && <path d={linea} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
      {puntos.map((p, i) => (
        <g key={p.etiqueta + i}>
          <circle cx={x(i)} cy={y(p.valor)} r={i === puntos.length - 1 ? 4.2 : 3} fill="#fff" stroke={color} strokeWidth="2">
            <title>{`${p.etiqueta}: ${p.valor}`}</title>
          </circle>
          {p.valor > 0 && <text x={x(i)} y={y(p.valor) - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={TINTA}>{p.valor}</text>}
          {mostrarX(i) && <text x={x(i)} y={H - 7} textAnchor={i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#94a3b8">{p.etiqueta}</text>}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Barra apilada con leyenda (para «qué atender»)
// ---------------------------------------------------------------------------------------------

export interface ParteApilada {
  key: string;
  etiqueta: string;
  valor: number;
  color: string;
  detalle?: string;
  onClick?: () => void;
}

export function BarraApilada({ partes, vacio }: { partes: ParteApilada[]; vacio: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="dash-apilada">
      <div className="dash-apilada-barra" role="img" aria-label={partes.map((p) => `${p.etiqueta}: ${p.valor}`).join(', ')}>
        {total === 0 ? <span style={{ width: '100%', background: '#eef1f5' }} /> : partes.filter((p) => p.valor > 0).map((p) => (
          <span key={p.key} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} title={`${p.etiqueta}: ${p.valor}`} />
        ))}
      </div>
      {total === 0 && <p className="dash-dona-vacio">{vacio}</p>}
      <ul className="dash-leyenda dash-leyenda--filas">
        {partes.map((p) => {
          const fila = (
            <>
              <i style={{ background: p.color }} />
              <span className="dash-leyenda-t">{p.etiqueta}{p.detalle && <small>{p.detalle}</small>}</span>
              <b style={{ color: p.valor > 0 ? p.color : undefined }}>{p.valor}</b>
            </>
          );
          return <li key={p.key}>{p.onClick && p.valor > 0 ? <button type="button" onClick={p.onClick}>{fila}</button> : <div>{fila}</div>}</li>;
        })}
      </ul>
    </div>
  );
}
