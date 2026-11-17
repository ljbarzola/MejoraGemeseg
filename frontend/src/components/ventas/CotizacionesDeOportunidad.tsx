import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Star } from 'lucide-react';
import {
  getCotizacionesDeOportunidad,
  marcarCotizacionPrincipal,
  type CotizacionesDeOportunidad as Datos,
} from '../../services/cotizador.service';
import { COT_STATUS_LABEL, type CotStatus } from '../../utils/cotizador/types';

const dinero = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cotizaciones de una oportunidad (2026-11-17). Una oportunidad puede tener varias (versiones o
 * alternativas); el vendedor marca UNA como principal y su total pasa a ser el monto cotizado de la
 * oportunidad (se actualiza solo cada vez que esa cotización se guarda). «Cotizar» abre el Cotizador
 * con el cliente puesto y la cotización nueva ya unida a esta oportunidad.
 */
export default function CotizacionesDeOportunidad({
  oportunidadId,
  puedeEscribir,
  onMontoCambio,
}: {
  oportunidadId: number;
  puedeEscribir: boolean;
  /** El monto de la oportunidad cambió porque se eligió otra principal (o hay principal: no se escribe a mano). */
  onMontoCambio: (monto: number | null, hayPrincipal: boolean) => void;
}) {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [marcando, setMarcando] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    getCotizacionesDeOportunidad(oportunidadId)
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        onMontoCambio(d.montoOportunidad, d.cotizaciones.some((c) => c.principal));
      })
      .catch(() => vigente && setError('No se pudieron cargar las cotizaciones de esta oportunidad.'));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadId]);

  const marcar = async (quoteId: number) => {
    setMarcando(quoteId);
    setError('');
    try {
      const d = await marcarCotizacionPrincipal(oportunidadId, quoteId);
      setDatos(d);
      onMontoCambio(d.montoOportunidad, true);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo marcar la cotización principal. Intenta de nuevo.');
    } finally {
      setMarcando(null);
    }
  };

  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <label style={{ margin: 0 }}>Cotizaciones</label>
        <button
          type="button"
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 12.5 }}
          onClick={() => navigate(`/ventas/cotizador?oportunidad=${oportunidadId}`)}
        >
          <Calculator size={14} /> Cotizar
        </button>
      </div>
      {error && <div className="form-error" style={{ marginBottom: 6 }}>{error}</div>}
      {!datos && !error && <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Cargando...</p>}
      {datos && datos.cotizaciones.length === 0 && (
        <p style={{ fontSize: 13, color: '#718096', margin: 0 }}>
          Aún no tiene cotizaciones del Cotizador. Usa «Cotizar» para hacer una ya unida a esta oportunidad.
        </p>
      )}
      {datos && datos.cotizaciones.length > 0 && (
        <>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {datos.cotizaciones.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderTop: i === 0 ? 'none' : '1px solid #edf2f7',
                  background: c.principal ? '#f0f7ff' : undefined,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  {c.puedeAbrir ? (
                    <a
                      href={`/ventas/cotizador?cotizacion=${c.id}`}
                      className="enlace-tabla"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/ventas/cotizador?cotizacion=${c.id}`);
                      }}
                    >
                      <strong>{c.quoteNumber}</strong>
                    </a>
                  ) : (
                    <strong>{c.quoteNumber}</strong>
                  )}
                  <span style={{ color: '#718096' }}>
                    {' '}
                    · {c.quoteDate.split('-').reverse().join('/')} · {COT_STATUS_LABEL[c.status as CotStatus] ?? c.status}
                    {c.vendorName ? ` · ${c.vendorName}` : ''}
                  </span>
                </div>
                <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dinero(c.total)}</strong>
                {c.principal ? (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#2b6cb0', whiteSpace: 'nowrap' }}
                  >
                    <Star size={13} fill="currentColor" aria-hidden /> Principal
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
                    disabled={!puedeEscribir || marcando !== null}
                    onClick={() => marcar(c.id)}
                  >
                    {marcando === c.id ? 'Marcando...' : 'Marcar principal'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <small style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#718096' }}>
            El total de la cotización principal es el monto cotizado de la oportunidad y se actualiza solo al guardarla.
          </small>
        </>
      )}
    </div>
  );
}
