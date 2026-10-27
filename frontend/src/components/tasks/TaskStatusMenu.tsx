import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS } from '../../types/task';

const ESTADOS = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

/**
 * Insignia de estado de una tarea que, al hacer clic, abre un menú con los demás estados: se mueve
 * la tarea sin entrar a ella, guardar y salir. El padre decide cómo guardar (`onChange`) y pinta el
 * cambio al instante; si falla, vuelve a poner el estado anterior.
 *
 * El menú se pinta en el body (como RowActionsMenu): las tablas viven en un contenedor con scroll
 * propio y un menú absoluto quedaría recortado.
 */
export default function TaskStatusMenu({
  status,
  onChange,
  disabled,
  disabledTitle,
}: {
  status: string;
  onChange: (nuevo: string) => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const etiqueta = STATUS_LABELS[status] ?? status;

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
      const alto = menu.offsetHeight;
      const ancho = menu.offsetWidth;
      const hayEspacioAbajo = window.innerHeight - rect.bottom - 8 >= alto;
      const top = hayEspacioAbajo ? rect.bottom + 4 : Math.max(8, rect.top - 4 - alto);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8));
      setCoords({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="status-badge task-status-btn"
        style={{ backgroundColor: color + '22', color }}
        disabled={disabled}
        title={disabled ? disabledTitle : 'Cambiar estado'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
      >
        {etiqueta}
        {!disabled && <ChevronDown size={12} aria-hidden />}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="task-status-menu"
            style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999, visibility: coords ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {ESTADOS.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                className="task-status-option"
                onClick={() => {
                  setOpen(false);
                  if (s !== status) onChange(s);
                }}
              >
                <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[s] }} />
                <span style={{ flex: 1 }}>{STATUS_LABELS[s]}</span>
                {s === status && <Check size={14} aria-hidden />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
