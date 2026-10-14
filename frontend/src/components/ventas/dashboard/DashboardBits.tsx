import type { ReactNode } from 'react';

// Piezas visuales compartidas por las pestañas del dashboard de Ventas. Sin
// librería de gráficos a propósito (igual que el resumen): barras hechas con
// divs, que se leen bien y no pesan.

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Últimos N días contando hoy, en hora local de quien mira.
export function periodoDesdeDias(dias: number): { desde: string; hasta: string } {
  const hoy = new Date();
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() - (dias - 1));
  return { desde: iso(ini), hasta: iso(hoy) };
}

export const dinero = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? '—'
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v}%`);

export const formatoDia = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

export function Tarjeta({ titulo, hint, children }: { titulo: string; hint?: string; children: ReactNode }) {
  return (
    <div className="admin-section" style={{ margin: 0 }}>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{titulo}</h3>
      {hint && <p style={{ margin: '2px 0 10px', fontSize: '0.75rem', color: '#a0aec0' }}>{hint}</p>}
      {!hint && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

export function Contador({
  titulo, valor, color, detalle, onClick,
}: { titulo: string; valor: ReactNode; color: string; detalle?: string; onClick?: () => void }) {
  const contenido = (
    <>
      <div style={{ fontSize: '0.78rem', color: '#718096', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1.2 }}>{valor}</div>
      {detalle && <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: 2 }}>{detalle}</div>}
    </>
  );
  const estilo = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', textAlign: 'left' as const };
  return onClick ? (
    <button type="button" onClick={onClick} style={{ ...estilo, cursor: 'pointer', font: 'inherit' }}>{contenido}</button>
  ) : (
    <div style={estilo}>{contenido}</div>
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

const PERIODOS = [
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 90 días' },
  { dias: 180, label: 'Últimos 6 meses' },
  { dias: 365, label: 'Último año' },
];

export function SelectorPeriodo({ dias, onChange }: { dias: number; onChange: (d: number) => void }) {
  return (
    <select className="filter-select" value={dias} onChange={(e) => onChange(Number(e.target.value))} aria-label="Periodo">
      {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.label}</option>)}
    </select>
  );
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
