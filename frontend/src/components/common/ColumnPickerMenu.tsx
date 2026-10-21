import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, Menu, Pin } from 'lucide-react';

export interface PickableColumn {
  key: string;
  label: string;
}

/**
 * Botón "Columnas" con menú desplegable para que cada persona elija qué
 * columnas ve en una tabla y en qué orden. ÚSALO en cualquier tabla de
 * listado con columnas opcionales, junto a los filtros (siempre visible: ver
 * LAYOUT ESTABLE en styles.css). Va de la mano de useColumnPreferences.
 *
 * Reglas del menú (pedidas así por el usuario):
 *  - Marcar, desmarcar y arrastrar solo modifican un BORRADOR dentro del
 *    menú. La tabla de atrás no cambia hasta pulsar "Aplicar".
 *  - "Aplicar" es el único botón: entrega la lista nueva a `onApply` y cierra.
 *  - Clic fuera del menú o Escape lo cierra descartando el borrador.
 *  - Las filas visibles se reordenan arrastrando el asa de tres rayitas (☰);
 *    con teclado, el asa responde a flecha arriba/abajo.
 *  - Columnas fijas (2026-10-20): la principal ya viene fijada y no se suelta; con
 *    la chincheta de otra fila se fija una más (máximo 2 en total) y esa pasa a
 *    ir pegada a la izquierda. Solo se muestra si la pantalla pasa `pinned`
 *    (viene de useColumnPreferences) y `onApply` recibe la fijada como 2.º argumento.
 */
export default function ColumnPickerMenu({
  columns,
  visible,
  onApply,
  pinned,
  maxPinned = 1,
  fixedLabel = 'Nombre',
  disabled,
  disabledTitle,
}: {
  /** Todas las columnas elegibles (sin la fija). */
  columns: PickableColumn[];
  /** Keys visibles hoy, en orden. */
  visible: string[];
  /** Recibe las keys visibles en su orden final y, si hay `pinned`, las fijadas. */
  onApply: (keys: string[], pinned?: string[]) => void | Promise<unknown>;
  /** Columnas elegibles fijadas hoy. Sin esta prop el menú no ofrece fijar. */
  pinned?: string[];
  /** Cuántas columnas elegibles se pueden fijar (la principal ya cuenta aparte). */
  maxPinned?: number;
  /** Columna que siempre va primera y no se puede ocultar. */
  fixedLabel?: string;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [draftPinned, setDraftPinned] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // El arrastre solo vale si empezó en el asa: la fila entera es `draggable`
  // pero no debe arrancar al pulsar la casilla o el texto.
  const desdeAsa = useRef(false);

  // Sin `pinned`, o si la pantalla ya fija todo lo que cabe (maxPinned 0), no se ofrece fijar.
  const puedeFijar = !!pinned && maxPinned > 0;
  const porKey = new Map(columns.map((c) => [c.key, c]));
  const ocultas = columns.filter((c) => !draft.includes(c.key));

  const abrir = () => {
    // Borrador inicial = lo que se ve hoy, sin keys de campos que ya no existen.
    setDraft(visible.filter((k) => porKey.has(k)));
    setDraftPinned((pinned ?? []).filter((k) => porKey.has(k)));
    setDragKey(null);
    setOverKey(null);
    setOpen(true);
  };

  // La tabla vive en un contenedor con overflow: el menú se pinta en el body,
  // pegado al botón (misma técnica que RowActionsMenu).
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const rect = btn.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
      const spaceAbove = rect.top - gap - 8;
      const openUp = menu.offsetHeight > spaceBelow && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(480, openUp ? spaceAbove : spaceBelow));
      const alto = Math.min(menu.offsetHeight, maxHeight);
      const top = openUp ? Math.max(8, rect.top - gap - alto) : rect.bottom + gap;
      const left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
      setCoords({ top, left, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, draft.length]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (key: string) => {
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
    // Ocultar una columna la suelta.
    setDraftPinned((p) => p.filter((k) => k !== key));
  };

  /** Fija/suelta una columna; al fijarla sube al inicio de la lista, que es donde va a quedar. */
  const alternarFija = (key: string) => {
    if (draftPinned.includes(key)) {
      setDraftPinned((p) => p.filter((k) => k !== key));
      return;
    }
    if (draftPinned.length >= maxPinned) return;
    setDraftPinned((p) => [...p, key]);
    setDraft((d) => [key, ...d.filter((k) => k !== key)]);
  };

  /** Mueve `key` para que quede justo antes de `antesDe` (o al final si es null). */
  const mover = (key: string, antesDe: string | null) =>
    setDraft((d) => {
      const sin = d.filter((k) => k !== key);
      const idx = antesDe === null ? sin.length : sin.indexOf(antesDe);
      if (idx === -1) return d;
      return [...sin.slice(0, idx), key, ...sin.slice(idx)];
    });

  const desplazar = (key: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.indexOf(key);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const aplicar = () => {
    setOpen(false);
    void (pinned ? onApply(draft, draftPinned) : onApply(draft));
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn-secondary"
        onClick={() => (open ? setOpen(false) : abrir())}
        disabled={disabled}
        title={disabled ? disabledTitle : 'Elegir qué columnas ver en la tabla'}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
      >
        <Columns3 size={15} /> Columnas
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Columnas de la tabla"
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            width: 264,
            maxHeight: coords?.maxHeight,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 1000,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          <div style={{ padding: '10px 12px 6px', fontSize: 12, fontWeight: 700, color: '#2d3748' }}>
            Columnas de la tabla
            <div style={{ fontWeight: 400, fontSize: 11, color: '#718096', marginTop: 2 }}>
              Arrastra ☰ para ordenar.{puedeFijar ? ' Usa 📌 para fijar una columna al desplazar.' : ''} Se guarda en tu cuenta.
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: '0 6px' }}>
            <Fila>
              <span style={{ width: 14 }} />
              <input type="checkbox" checked disabled />
              <span style={{ flex: 1, fontSize: 12.5, color: '#a0aec0' }}>{fixedLabel}</span>
              <Pin size={12} color="#a0aec0" fill="#a0aec0" aria-label="siempre visible y fija" />
            </Fila>

            {draft.map((key) => {
              const col = porKey.get(key);
              if (!col) return null;
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={(e) => {
                    if (!desdeAsa.current) { e.preventDefault(); return; }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', key);
                    setDragKey(key);
                  }}
                  onDragOver={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    setOverKey(key);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragKey && dragKey !== key) mover(dragKey, key);
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); desdeAsa.current = false; }}
                  style={{
                    borderTop: overKey === key && dragKey && dragKey !== key ? '2px solid var(--azul-claro, #4299e1)' : '2px solid transparent',
                    opacity: dragKey === key ? 0.4 : 1,
                  }}
                >
                  <Fila>
                    {/* span y no button: Firefox no inicia el arrastre de un
                        padre `draggable` si se pulsa sobre un <button>. */}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Mover ${col.label}`}
                      title="Arrastra para ordenar"
                      onMouseDown={() => { desdeAsa.current = true; }}
                      onMouseUp={() => { desdeAsa.current = false; }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') { e.preventDefault(); desplazar(key, -1); }
                        if (e.key === 'ArrowDown') { e.preventDefault(); desplazar(key, 1); }
                      }}
                      style={{ cursor: 'grab', color: '#a0aec0', display: 'flex' }}
                    >
                      <Menu size={14} />
                    </span>
                    <input type="checkbox" checked onChange={() => toggle(key)} id={`col-${key}`} />
                    <label htmlFor={`col-${key}`} style={{ flex: 1, fontSize: 12.5, color: '#2d3748', cursor: 'pointer' }}>{col.label}</label>
                    {puedeFijar && (
                      <button
                        type="button"
                        onClick={() => alternarFija(key)}
                        disabled={!draftPinned.includes(key) && draftPinned.length >= maxPinned}
                        aria-pressed={draftPinned.includes(key)}
                        aria-label={draftPinned.includes(key) ? `Soltar ${col.label}` : `Fijar ${col.label}`}
                        title={
                          draftPinned.includes(key)
                            ? 'Fijada: no se va al desplazar la tabla. Clic para soltarla.'
                            : draftPinned.length >= maxPinned
                              ? 'Ya hay el máximo de columnas fijas (2 con la principal). Suelta otra primero.'
                              : 'Fijar: se queda a la izquierda al desplazar la tabla.'
                        }
                        style={{
                          display: 'flex', padding: 2, border: 'none', background: 'transparent', borderRadius: 4,
                          cursor: !draftPinned.includes(key) && draftPinned.length >= maxPinned ? 'not-allowed' : 'pointer',
                          opacity: !draftPinned.includes(key) && draftPinned.length >= maxPinned ? 0.3 : 1,
                          color: draftPinned.includes(key) ? 'var(--azul-claro, #12375f)' : '#a0aec0',
                        }}
                      >
                        <Pin size={13} fill={draftPinned.includes(key) ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </Fila>
                </div>
              );
            })}
            {/* Soltar aquí manda la columna al final de las visibles. */}
            {draft.length > 0 && (
              <div
                onDragOver={(e) => { if (dragKey) { e.preventDefault(); setOverKey('__fin'); } }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey) mover(dragKey, null);
                  setDragKey(null);
                  setOverKey(null);
                }}
                style={{ height: 8, borderTop: overKey === '__fin' ? '2px solid var(--azul-claro, #4299e1)' : '2px solid transparent' }}
              />
            )}

            {ocultas.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: '#a0aec0', padding: '6px 8px 2px' }}>Ocultas — márcalas para agregarlas</div>
                {ocultas.map((col) => (
                  <Fila key={col.key}>
                    <span style={{ width: 14 }} />
                    <input type="checkbox" checked={false} onChange={() => toggle(col.key)} id={`col-${col.key}`} />
                    <label htmlFor={`col-${col.key}`} style={{ flex: 1, fontSize: 12.5, color: '#4a5568', cursor: 'pointer' }}>{col.label}</label>
                  </Fila>
                ))}
              </>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="auth-btn" onClick={aplicar} style={{ padding: '6px 18px', fontSize: 12.5 }}>
              Aplicar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Fila({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px' }}>{children}</div>;
}
