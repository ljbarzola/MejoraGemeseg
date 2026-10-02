import { useEffect, useRef } from 'react';

/**
 * Error dentro de un modal o panel con desplazamiento: se trae a la vista para
 * que no quede arriba, fuera de pantalla, mientras la persona está más abajo.
 */
export default function ErrorBanner({ mensaje }: { mensaje: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mensaje) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [mensaje]);
  if (!mensaje) return null;
  return <div ref={ref} className="form-error">{mensaje}</div>;
}
