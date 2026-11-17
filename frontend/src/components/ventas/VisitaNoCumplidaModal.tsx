import { useEffect, useRef, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import { cancelVisit, type ClientVisit } from '../../services/ventas.service';
import { MOTIVOS_VISITA_NO_CUMPLIDA } from '../../utils/visitasVentas';

const OTRO = '__otro__';

/**
 * «Cancelar la visita»: pide POR QUÉ no se cumplió (lista fija + «Otro» con texto) y un detalle opcional.
 * Pedido del asesor comercial (2026-11-17): saber por qué no se cumplen las rutas planificadas.
 */
export default function VisitaNoCumplidaModal({
  visita,
  onClose,
  onDone,
}: {
  visita: ClientVisit;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const nombre = visita.cliente?.name ?? visita.clientName;

  const guardar = async () => {
    const elegido = motivo === OTRO ? otro.trim() : motivo;
    if (!elegido) {
      setError(motivo === OTRO ? 'Escribe el motivo.' : 'Elige por qué no se cumplió la visita.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await cancelVisit(visita.id, elegido, detalle.trim() || undefined);
      onDone();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo cancelar la visita. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="visita-nc-title">
        <div className="modal-header">
          <h3 id="visita-nc-title">Cancelar la visita</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div ref={errorRef}>
            <ErrorBanner mensaje={error} />
          </div>
          <p className="cot-muted" style={{ marginTop: 0 }}>
            ¿Por qué no se cumplió la visita a <strong>{nombre}</strong>?
          </p>
          <div role="radiogroup" aria-label="Motivo" style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {[...MOTIVOS_VISITA_NO_CUMPLIDA, OTRO].map((m) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                <input type="radio" name="motivo-visita" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
                {m === OTRO ? 'Otro' : m}
              </label>
            ))}
          </div>
          {motivo === OTRO && (
            <div className="form-group">
              <label htmlFor="visita-nc-otro">Motivo</label>
              <input id="visita-nc-otro" value={otro} maxLength={200} onChange={(e) => setOtro(e.target.value)} autoFocus />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="visita-nc-detalle">Detalle (opcional)</label>
            <textarea id="visita-nc-detalle" rows={2} maxLength={1000} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>
            Volver
          </button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Cancelar la visita'}
          </button>
        </div>
      </div>
    </div>
  );
}
