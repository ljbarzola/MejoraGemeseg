import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Hoja que sube desde abajo (pantalla de campo): pensada para el pulgar, con una «X» grande y scroll propio. */
export default function Hoja({ titulo, onClose, children, bloqueada = false }: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  /** Mientras algo se guarda, no se puede cerrar. */
  bloqueada?: boolean;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bloqueada) onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, bloqueada]);

  return (
    <div className="cp-hoja-fondo" onClick={() => { if (!bloqueada) onClose(); }}>
      <div className="cp-hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="cp-hoja-cab">
          <h2>{titulo}</h2>
          <button type="button" className="cp-hoja-x" onClick={onClose} disabled={bloqueada} aria-label="Cerrar"><X size={24} /></button>
        </div>
        <div className="cp-hoja-cuerpo">{children}</div>
      </div>
    </div>
  );
}
