import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const ANCHO_CALENDARIO = 240;
const ALTO_CALENDARIO = 280;
const MARGEN = 8;

/**
 * Dónde pintar el calendario para que NUNCA se salga de la pantalla ni quede cortado por una ventana (modal) con
 * scroll: debajo del campo si cabe, encima si no, y si no cabe en ninguno se ajusta al borde. Horizontalmente se
 * recorta al ancho visible. (Regla de UX: ver `.agents/RECOMENDACIONES_UX_UI.md`.)
 */
function posicionCalendario(r: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const abajo = vh - r.bottom - MARGEN;
  const arriba = r.top - MARGEN;
  let top: number;
  if (abajo >= ALTO_CALENDARIO) top = r.bottom + 4;
  else if (arriba >= ALTO_CALENDARIO) top = r.top - ALTO_CALENDARIO - 4;
  else top = Math.max(MARGEN, Math.min(vh - ALTO_CALENDARIO - MARGEN, r.bottom + 4));
  const left = Math.max(MARGEN, Math.min(r.left, vw - ANCHO_CALENDARIO - MARGEN));
  return { top, left };
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** true solo si day/month/year forman una fecha real (rechaza 31/02/2026, etc). */
function isValidDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

function displayToIso(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const day = +match[1];
  const month = +match[2];
  const year = +match[3];
  if (!isValidDate(day, month, year)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Inserta las barras del formato dd/mm/aaaa mientras el usuario escribe solo dígitos. */
function maskDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

interface Props {
  value: string; // ISO yyyy-mm-dd, o '' si vacío
  onChange: (isoValue: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string; // ISO
  max?: string; // ISO
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

/**
 * Reemplazo de <input type="date"> con formato dd/mm/aaaa fijo: el
 * selector nativo del navegador pinta mes/día/año cuando el SO está en
 * inglés, y eso no se puede forzar con HTML/CSS. Mismo contrato: recibe
 * y emite el valor en ISO (yyyy-mm-dd) para que el resto del formulario
 * no cambie.
 */
export default function DateInput({ value, onChange, id, name, required, disabled, min, max, className, style, placeholder = 'dd/mm/aaaa' }: Props) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const [y] = value ? value.split('-') : [String(new Date().getFullYear())];
    return +y;
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const [, m] = value ? value.split('-') : ['', String(new Date().getMonth() + 1)];
    return +m - 1;
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // El calendario se pinta fuera de la ventana (portal al <body>) y se recoloca al abrir, al hacer scroll y al cambiar el tamaño.
  const recolocar = useCallback(() => {
    if (wrapperRef.current) setPos(posicionCalendario(wrapperRef.current.getBoundingClientRect()));
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    recolocar();
    window.addEventListener('scroll', recolocar, true);
    window.addEventListener('resize', recolocar);
    return () => {
      window.removeEventListener('scroll', recolocar, true);
      window.removeEventListener('resize', recolocar);
    };
  }, [open, recolocar]);

  useEffect(() => {
    setText(isoToDisplay(value));
    if (value) {
      const [y, m] = value.split('-');
      setViewYear(+y);
      setViewMonth(+m - 1);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const dentro = e.target as Node;
      if (wrapperRef.current?.contains(dentro) || popupRef.current?.contains(dentro)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const commitText = (next: string) => {
    setText(next);
    if (next === '') {
      onChange('');
      return;
    }
    const iso = displayToIso(next);
    if (iso) onChange(iso);
  };

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const pickDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!inRange(iso)) return;
    onChange(iso);
    setText(isoToDisplay(iso));
    setOpen(false);
  };

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          inputMode="numeric"
          id={id}
          name={name}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => commitText(maskDigits(e.target.value))}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); else if (e.key === 'ArrowDown') setOpen(true); }}
          className={className}
          style={{ width: '100%', paddingRight: 30, boxSizing: 'border-box', ...style }}
          maxLength={10}
        />
        <button
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-label="Abrir calendario"
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer',
            color: '#888', display: 'flex', alignItems: 'center', padding: 4,
          }}
        >
          <Calendar size={15} />
        </button>
      </div>

      {open && !disabled && pos && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed', zIndex: 100000, top: pos.top, left: pos.left,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 10, width: ANCHO_CALENDARIO,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setViewMonth((m) => (m === 0 ? (setViewYear((y) => y - 1), 11) : m - 1))}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: 4 }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{MESES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => setViewMonth((m) => (m === 11 ? (setViewYear((y) => y + 1), 0) : m + 1))}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: 4 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DIAS.map((d) => (
              <span key={d} style={{ fontSize: 10, color: '#999', textAlign: 'center' }}>{d}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (day == null) return <span key={i} />;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const selected = iso === value;
              const disabledDay = !inRange(iso);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabledDay}
                  style={{
                    border: 'none', borderRadius: 4, padding: '4px 0', fontSize: 12,
                    background: selected ? '#4f46e5' : 'transparent',
                    color: disabledDay ? '#ccc' : selected ? '#fff' : '#333',
                    cursor: disabledDay ? 'default' : 'pointer',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
