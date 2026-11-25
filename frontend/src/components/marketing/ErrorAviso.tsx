import { useEffect, useRef } from 'react';

/** Aviso de error dentro de una ventana con scroll: se lleva a la vista al aparecer. */
export default function ErrorAviso({ mensaje }: { mensaje: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    return () => clearTimeout(t);
  }, [mensaje]);
  if (!mensaje) return null;
  return <div ref={ref} className="form-error" style={{ marginBottom: '10px' }}>{mensaje}</div>;
}
