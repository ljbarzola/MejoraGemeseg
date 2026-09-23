import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  /** Rojo, para acciones destructivas (eliminar). */
  danger?: boolean;
  /** Texto de ayuda bajo la etiqueta, para acciones cuyo efecto no es obvio. */
  hint?: string;
  disabled?: boolean;
}

/**
 * Menú compacto de acciones secundarias de una fila.
 *
 * Existe porque una fila con cuatro o cinco botones sueltos deja de leerse:
 * no se distingue la acción principal de las ocasionales, y la columna crece
 * hasta empujar el resto de la tabla. Aquí la pantalla deja visible solo su
 * acción principal y mete las demás detrás de este botón.
 *
 * Se cierra al hacer clic fuera o con Escape, y devuelve el foco al botón,
 * para que también funcione con teclado.
 */
export default function RowActionsMenu({
  actions,
  label = 'Más acciones',
}: {
  actions: RowAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // La tabla vive en un contenedor con overflow, así que un menú absoluto
  // se recorta y solo se ve una franja blanca. Se pinta en el body, pegado
  // al botón, y se abre hacia arriba cuando abajo no cabe.
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
      const menuHeight = menu.offsetHeight;
      const menuWidth = menu.offsetWidth;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(360, openUp ? spaceAbove : spaceBelow));
      const top = openUp
        ? Math.max(8, rect.top - gap - Math.min(menuHeight, maxHeight))
        : rect.bottom + gap;
      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setCoords({ top, left, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, actions.length]);

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

  if (actions.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn-secondary"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        style={{ padding: '6px 9px', display: 'flex', alignItems: 'center' }}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            minWidth: 224,
            maxHeight: coords?.maxHeight,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 1000,
            padding: '4px',
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 7,
                background: 'none',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: a.disabled ? 'default' : 'pointer',
                opacity: a.disabled ? 0.45 : 1,
                color: a.danger ? '#c53030' : '#2d3748',
              }}
              onMouseEnter={(e) => {
                if (!a.disabled) e.currentTarget.style.background = a.danger ? '#fff5f5' : '#f1f5f9';
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              {a.icon && <span style={{ display: 'flex', marginTop: 1 }}>{a.icon}</span>}
              <span>
                {a.label}
                {a.hint && (
                  <span style={{ display: 'block', fontWeight: 400, fontSize: '0.74rem', color: '#718096', marginTop: 1 }}>
                    {a.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
