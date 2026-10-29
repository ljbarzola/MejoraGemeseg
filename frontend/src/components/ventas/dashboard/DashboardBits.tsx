import type { ReactNode } from 'react';

// Piezas visuales compartidas por las pestañas del dashboard de Ventas. Sin
// librería de gráficos a propósito (igual que el resumen): barras hechas con
// divs, que se leen bien y no pesan.

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const dinero = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? '—'
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v}%`);

export const formatoDia = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

/**
 * Tarjeta ESTÁNDAR del dashboard (2026-10-21): blanca, con borde fino, título y una línea de ayuda. Todas las
 * pestañas usan esta misma pieza para que el tablero se lea igual en todas partes.
 */
export function Tarjeta({ titulo, hint, children, accion, className, hoy }: { titulo: string; hint?: ReactNode; children: ReactNode; accion?: ReactNode; className?: string; hoy?: boolean }) {
  return (
    // data-tablas-vivas="off": una tabla dentro de una tarjeta no lleva su propio scroll (ver utils/tablasVivas.ts).
    <section className={`dash-card${className ? ` ${className}` : ''}`} data-tablas-vivas="off">
      <header className="dash-card-cab">
        <div>
          <h3>{titulo}{hoy && <EtiquetaHoy />}</h3>
          {hint && <p className="dash-card-hint">{hint}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

/**
 * Marca de las tarjetas que son «de hoy»: muestran cómo está todo AHORA y no cambian con el periodo de la barra de
 * arriba. Es la única excepción al periodo único del dashboard, y siempre se rotula así (2026-10-28).
 */
export function EtiquetaHoy() {
  return <span className="dash-etiqueta-hoy" title="Esta tarjeta muestra cómo está todo hoy: no cambia al cambiar el periodo">Hoy · no depende del periodo</span>;
}

/** Franja de cifras: UNA sola tarjeta partida en celdas finas (no una tarjeta alta por cifra). */
export function KpiFila({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`dash-kpis${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** Una celda de la franja de cifras: nombre, número y una línea de detalle. */
export function Contador({
  titulo, valor, color, detalle, onClick,
}: { titulo: string; valor: ReactNode; color: string; detalle?: string; onClick?: () => void }) {
  const contenido = (
    <>
      <span className="dash-kpi-t">{titulo}</span>
      <span className="dash-kpi-v">{valor}</span>
      {detalle && <span className="dash-kpi-d" title={detalle}>{detalle}</span>}
    </>
  );
  const estilo = { ['--kpi' as string]: color };
  return onClick ? (
    <button type="button" className="dash-kpi" style={estilo} onClick={onClick}>{contenido}</button>
  ) : (
    <div className="dash-kpi" style={estilo}>{contenido}</div>
  );
}

export function BarraH({
  etiqueta, valor, max, color = '#2b6cb0', detalle,
}: { etiqueta: string; valor: number; max: number; color?: string; detalle?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 2 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiqueta}</span>
        <strong style={{ whiteSpace: 'nowrap' }}>{detalle ?? valor}</strong>
      </div>
      <div style={{ height: 8, background: '#edf2f7', borderRadius: 4 }}>
        <div style={{ width: `${max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function SinDatos({ texto }: { texto: string }) {
  return <p style={{ margin: 0, color: '#a0aec0', fontSize: 13 }}>{texto}</p>;
}

// Aviso de «pocas muestras» que acompaña a toda cifra calculada con menos de 5 casos.
export function Muestra({ n, pocas }: { n: number; pocas: boolean }) {
  return (
    <span style={{ fontSize: 11, color: pocas ? '#b45309' : '#a0aec0' }}>
      {pocas ? `pocas muestras (n=${n})` : `n=${n}`}
    </span>
  );
}

export function Cargando({ error, onReintentar }: { error: boolean; onReintentar: () => void }) {
  return error ? (
    <div className="admin-section" style={{ marginTop: 16 }}>
      <p style={{ margin: 0, color: '#718096' }}>No se pudo cargar esta pestaña.</p>
      <button type="button" className="btn-secondary" onClick={onReintentar} style={{ marginTop: 10, padding: '8px 16px', fontSize: '0.9rem' }}>Reintentar</button>
    </div>
  ) : (
    <div className="loading-state">Cargando...</div>
  );
}
