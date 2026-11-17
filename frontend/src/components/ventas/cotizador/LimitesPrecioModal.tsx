import { useState } from 'react';
import ErrorBanner from '../../common/ErrorBanner';
import { saveCotLimites } from '../../../services/cotizador.service';
import type { CotLimites } from '../../../utils/cotizador/alertas';

// Límites de precio de la empresa. Solo generan avisos en la cotización: nunca impiden guardarla.
// Los ve cualquiera que use el Cotizador (así sabe por qué le sale un aviso); solo administradores
// y gerentes los cambian (el servidor también lo exige). Vacío = sin límite.

const texto = (n: number | null) => (n === null ? '' : String(n));
const aNumero = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function LimitesPrecioModal({
  limites,
  puedeEditar,
  onClose,
  onSaved,
}: {
  limites: CotLimites;
  puedeEditar: boolean;
  onClose: () => void;
  onSaved: (l: CotLimites) => void;
}) {
  const [maxDesc, setMaxDesc] = useState(texto(limites.maxDescuentoPct));
  const [maxDescServ, setMaxDescServ] = useState(texto(limites.maxDescuentoServiciosPct));
  const [minGan, setMinGan] = useState(texto(limites.minGananciaPct));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    const valores = [maxDesc, maxDescServ, minGan];
    if (valores.some((v) => v.trim() !== '' && aNumero(v) === null)) {
      return setError('Escribe solo números positivos, o deja el campo vacío para no poner límite.');
    }
    if ([maxDesc, maxDescServ].some((v) => (aNumero(v) ?? 0) > 100)) {
      return setError('Un descuento máximo no puede pasar de 100 %.');
    }
    setBusy(true);
    setError('');
    try {
      const guardados = await saveCotLimites({
        maxDescuentoPct: aNumero(maxDesc),
        maxDescuentoServiciosPct: aNumero(maxDescServ),
        minGananciaPct: aNumero(minGan),
      });
      onSaved(guardados);
    } catch {
      setError('No se pudieron guardar los límites. Intenta de nuevo; si sigue igual, avisa a Sistemas.');
      setBusy(false);
    }
  };

  const campo = (id: string, etiqueta: string, ayuda: string, valor: string, set: (v: string) => void) => (
    <div className="form-group">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type="number"
        min={0}
        step="0.1"
        value={valor}
        disabled={!puedeEditar}
        onChange={(e) => set(e.target.value)}
        placeholder="Sin límite"
      />
      <p className="cot-muted" style={{ margin: '4px 0 0' }}>{ayuda}</p>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-lp-title">
        <div className="modal-header">
          <h3 id="cot-lp-title">Límites de precio</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p className="cot-muted" style={{ marginTop: 0 }}>
            Si una cotización se pasa, aparece un aviso. No impide guardarla ni enviarla.{' '}
            {puedeEditar ? 'Campo vacío = sin límite.' : 'Solo un administrador o gerente puede cambiarlos.'}
          </p>
          {campo('cot-lp-desc', 'Descuento máximo en equipos y materiales (%)', 'Sobre el total de la cotización, antes de IVA.', maxDesc, setMaxDesc)}
          {campo(
            'cot-lp-serv',
            'Descuento máximo en servicios (%)',
            'Si hay servicios y equipos juntos, vale el límite más bajo.',
            maxDescServ,
            setMaxDescServ,
          )}
          {campo(
            'cot-lp-gan',
            'Ganancia mínima sobre el costo (%)',
            'Con descuento y márgenes incluidos; los servicios no cuentan.',
            minGan,
            setMinGan,
          )}
          <p className="cot-muted" style={{ marginBottom: 0 }}>
            El precio mínimo de cada producto se pone en el Catálogo.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {puedeEditar ? 'Cancelar' : 'Cerrar'}
          </button>
          {puedeEditar && (
            <button className="auth-btn" onClick={guardar} disabled={busy}>
              {busy ? 'Guardando...' : 'Guardar límites'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
