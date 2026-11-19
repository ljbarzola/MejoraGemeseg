import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';

const usd = (n: unknown) => `$${Number(n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Fila = ({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) => (
  <div className={`conv-cot-fila ${fuerte ? 'conv-cot-fila--total' : ''}`}>
    <span>{etiqueta}</span>
    <strong>{valor}</strong>
  </div>
);

// Vista previa de la cotización que calculó el sistema para una respuesta del bot. Solo la ve el equipo:
// incluye el costo y el margen. «Editar en el Cotizador» la abre para cambiarla, guardarla y enviarla.
export default function CotizacionBotModal({
  cotizacion,
  puedeEditar,
  onEditar,
  onClose,
}: {
  cotizacion: any;
  puedeEditar: boolean;
  onEditar: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  const custodia = cotizacion?.tipo === 'CUSTODIA';
  const e = cotizacion?.entrada ?? {};

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" role="dialog" aria-modal="true" aria-label="Cotización del bot" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h3>{custodia ? 'Cotización de custodia móvil' : 'Cotización de productos'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body conv-cot">
          <p className="conv-cot-nota">La calculó el sistema con las tarifas del Cotizador; el bot no escribe precios. Revísala antes de enviarla.</p>

          {custodia ? (
            <div className="conv-cot-bloque">
              <Fila etiqueta="Ruta" valor={`${e.origen || '—'} → ${e.destino || '—'}`} />
              <Fila etiqueta="Distancia de ida" valor={`${e.kmIda ?? 0} km${e.incluyeRegreso ? ' (con regreso)' : ''}`} />
              <Fila etiqueta="Región" valor={e.region || '—'} />
              <Fila etiqueta="Agentes · choferes · vehículos" valor={`${e.agentes ?? 0} · ${e.choferes ?? 0} · ${e.vehiculos ?? 0}`} />
              <Fila etiqueta="Viajes · noches" valor={`${e.viajes ?? 1} · ${e.noches ?? 0}`} />
            </div>
          ) : (
            <div className="conv-cot-bloque">
              {(cotizacion?.lineas ?? []).map((l: any, i: number) => (
                <Fila key={i} etiqueta={`${l.cantidad} × ${l.nombre}`} valor={usd(l.total)} />
              ))}
            </div>
          )}

          <div className="conv-cot-bloque">
            <Fila etiqueta="Subtotal" valor={usd(custodia ? cotizacion?.precioSinIva : cotizacion?.totales?.subtotal)} />
            <Fila etiqueta="IVA" valor={usd(custodia ? cotizacion?.iva : cotizacion?.totales?.iva)} />
            <Fila etiqueta="Total" valor={usd(custodia ? cotizacion?.total : cotizacion?.totales?.total)} fuerte />
          </div>

          {custodia && (
            <p className="conv-cot-nota">
              Para el equipo: costo {usd(cotizacion?.costoTotal)} · margen {cotizacion?.margenPct}%.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="auth-btn" disabled={!puedeEditar} onClick={onEditar}>
            <Calculator size={16} aria-hidden /> Editar en el Cotizador
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
