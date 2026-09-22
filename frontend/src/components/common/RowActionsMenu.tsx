import { useState, useRef, useEffect, type ReactNode } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 224,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 50,
            overflow: 'hidden',
            padding: '4px',
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
        </div>
      )}
    </div>
  );
}
