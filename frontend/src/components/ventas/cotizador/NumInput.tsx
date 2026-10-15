import { useEffect, useState, type CSSProperties } from 'react';

interface Props {
  value: number | null;
  /** Se llama al terminar de escribir (salir del campo o Enter). null = campo vacío. */
  onCommit: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Campo numérico que NO recalcula con cada tecla: confirma al salir del campo o con Enter.
 * Así escribir "0.5" o borrar el contenido no quita una línea ni salta el cursor a medio escribir.
 */
export default function NumInput({
  value,
  onCommit,
  min,
  max,
  step = 'any',
  className,
  style,
  ariaLabel,
  disabled,
  placeholder,
}: Props) {
  const [text, setText] = useState(value === null || Number.isNaN(value) ? '' : String(value));

  useEffect(() => {
    setText(value === null || Number.isNaN(value) ? '' : String(value));
  }, [value]);

  const commit = () => {
    const t = text.trim().replace(',', '.');
    if (t === '') {
      onCommit(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setText(value === null ? '' : String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      className={className}
      style={style}
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
