import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { SIGNIFICADO_ETAPA } from '../../utils/etapasVentas';

// Ícono «?» junto al encabezado «Etapa»: al pulsarlo lista cada etapa con su significado. El panel va en
// `position: fixed` porque la tabla tiene su propio scroll y lo recortaría.
export default function EtapasAyuda({ etapas }: { etapas: { key: string; label: string; color: string }[] }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrar = () => setPos(null);
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', alTeclear);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', alTeclear);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [pos]);

  const abrir = (e: React.MouseEvent) => {
    // El encabezado ordena al hacer clic: este botón no debe cambiar el orden.
    e.stopPropagation();
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    setPos(pos ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 348)) });
  };

  return (
    <>
      <button ref={boton} type="button" className="etapas-ayuda-btn" onClick={abrir}
        onMouseDown={(e) => e.stopPropagation()} title="¿Qué significa cada etapa?" aria-label="¿Qué significa cada etapa?">
        <HelpCircle size={14} />
      </button>
      {/* En el <body>: la tabla tiene su propio scroll y recortaría el panel. */}
      {pos && createPortal(
        <div className="etapas-ayuda-panel" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Significado de las etapas">
          <strong>Las etapas, en orden</strong>
          <ol>
            {etapas.map((s) => (
              <li key={s.key}>
                <span className="etapas-ayuda-punto" style={{ background: s.color }} />
                <span><b>{s.label}.</b> {SIGNIFICADO_ETAPA[s.key] ?? 'Etapa propia de tu empresa.'}</span>
              </li>
            ))}
          </ol>
          <p className="etapas-ayuda-regla">
            Solo se avanza: no se vuelve a una etapa anterior. Una oportunidad cerrada (Aceptada o Perdida) se puede
            reabrir, y solo vuelve a «En evaluación»; queda marcada con «!».
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
