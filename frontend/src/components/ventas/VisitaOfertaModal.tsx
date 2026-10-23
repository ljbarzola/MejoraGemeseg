import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ServiciosPorCategoria from './ServiciosPorCategoria';
import OportunidadModal from './OportunidadModal';
import CambioEtapaOportunidadModal from './CambioEtapaOportunidadModal';
import ErrorBanner from '../common/ErrorBanner';
import { etapaPermitida } from '../../utils/etapasVentas';
import {
  completeVisit,
  getOportunidad,
  getSalesClient,
  getSalesClientStages,
  getServicios,
  updateVisit,
  type ClientVisit,
  type Oportunidad,
  type SalesClient,
  type SalesClientStage,
  type SalesServicio,
} from '../../services/ventas.service';

interface Props {
  visita: ClientVisit;
  onClose: () => void;
  // Cerrada la visita (y, si se quiso, la etapa de la oportunidad). `mensaje` es lo que se le avisa a la persona.
  onDone: (mensaje: string) => void;
}

// A qué etapa de la oportunidad apunta cada resultado de la visita. «Requiere seguimiento» no mueve nada.
const ETAPA_DEL_RESULTADO: Record<string, string> = {
  INTERESTED: 'LEIDO',
  QUOTED: 'COTIZADO',
  CLOSED_SALE: 'ACEPTADO',
  NOT_INTERESTED: 'RECHAZADO',
};

const RESULTADOS = [
  { value: 'INTERESTED', label: 'Interesado' },
  { value: 'QUOTED', label: 'Cotizado' },
  { value: 'CLOSED_SALE', label: 'Venta cerrada (Aceptada)' },
  { value: 'FOLLOW_UP', label: 'Requiere seguimiento' },
  { value: 'NOT_INTERESTED', label: 'No interesado (Perdida)' },
];

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Cierre de una visita de campo: qué se ofreció (productos y servicios del catálogo, el mismo de «Nueva
// oportunidad»), el monto y el resultado. Está conectado a la oportunidad: si la visita no tiene, se puede crear
// aquí; al completar se le suman los servicios y el monto, y se propone mover su etapa según el resultado con el
// mismo cuadro de «Cambiar de etapa» de Oportunidades (la etapa solo avanza; si no se puede, no se fuerza).
export default function VisitaOfertaModal({ visita, onClose, onDone }: Props) {
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [etapas, setEtapas] = useState<SalesClientStage[]>([]);
  const [cliente, setCliente] = useState<SalesClient | null>(null);
  const [oportunidad, setOportunidad] = useState<Oportunidad | null>(null);
  const [oportunidadId, setOportunidadId] = useState<number | null>(visita.opportunityId ?? null);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [monto, setMonto] = useState(visita.quotedAmount ? String(visita.quotedAmount) : '');
  const [resultado, setResultado] = useState(visita.outcome || 'QUOTED');
  const [notas, setNotas] = useState(visita.notes ?? '');
  const [creandoOportunidad, setCreandoOportunidad] = useState(false);
  const [aMoverEtapa, setAMoverEtapa] = useState<{ oportunidad: Oportunidad; destino: SalesClientStage; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getServicios().then(setServicios).catch(() => setError('No se pudo cargar el catálogo de productos y servicios.'));
    getSalesClientStages().then((e) => setEtapas([...e].sort((a, b) => a.order - b.order))).catch(() => setEtapas([]));
    // La empresa o persona de la visita: el cuadro de «Nueva oportunidad» la necesita para mostrarla elegida.
    if (visita.salesClientId) getSalesClient(visita.salesClientId).then(setCliente).catch(() => setCliente(null));
  }, [visita.salesClientId]);

  // La oportunidad de la visita: sus servicios quedan marcados de entrada (es lo que se fue a ofrecer).
  useEffect(() => {
    if (oportunidadId === null) { setOportunidad(null); return; }
    let vigente = true;
    getOportunidad(oportunidadId)
      .then((o) => {
        if (!vigente) return;
        setOportunidad(o);
        setServiceIds((prev) => (prev.length ? prev : o.services.map((s) => s.id)));
      })
      .catch(() => { if (vigente) setOportunidad(null); });
    return () => { vigente = false; };
  }, [oportunidadId]);

  const alternar = (id: number) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const etapaDestino = useMemo(() => {
    const clave = ETAPA_DEL_RESULTADO[resultado];
    return clave ? etapas.find((e) => e.key === clave) ?? null : null;
  }, [resultado, etapas]);
  const oportunidadAbierta = !!oportunidad && oportunidad.abierta;
  const puedeMoverEtapa = !!(oportunidadAbierta && etapaDestino && oportunidad!.status !== etapaDestino.key && etapaPermitida(oportunidad!, etapaDestino, etapas));

  // Lo que va a pasar al completar, dicho antes de hacerlo.
  const aviso = (() => {
    if (!visita.salesClientId) return 'Esta visita es de antes del Directorio y no tiene oportunidad: solo se guarda la oferta en la visita.';
    if (!oportunidad) return 'Sin oportunidad, solo se guarda la oferta en la visita. Si hay una negociación, crea la oportunidad aquí y quedará todo conectado.';
    if (!oportunidad.abierta) return 'La oportunidad ya está cerrada: la oferta se guarda en la visita y la oportunidad no cambia.';
    const suma = 'Se sumarán los productos y servicios y el monto a la oportunidad.';
    if (!etapaDestino) return `${suma} Su etapa no cambia.`;
    if (oportunidad.status === etapaDestino.key) return `${suma} Ya está en «${etapaDestino.label}».`;
    if (!puedeMoverEtapa) return `${suma} Ya está más adelante que «${etapaDestino.label}» y las etapas solo avanzan, así que su etapa no cambia.`;
    return `${suma} Después te propondremos pasarla a «${etapaDestino.label}».`;
  })();

  const crearOportunidad = async (nueva: Oportunidad) => {
    setCreandoOportunidad(false);
    try {
      await updateVisit(visita.id, { opportunityId: nueva.id });
      setOportunidadId(nueva.id);
      setServiceIds((prev) => (prev.length ? prev : nueva.services.map((s) => s.id)));
    } catch (err: any) {
      setError(mensajeDe(err, 'La oportunidad se creó, pero no se pudo ligar a la visita. Edita la visita para elegirla.'));
    }
  };

  const completar = async () => {
    setError('');
    if (resultado !== 'NOT_INTERESTED' && serviceIds.length === 0) {
      return setError('Elige al menos un producto o servicio de lo que se ofreció.');
    }
    const montoNumero = monto.trim() === '' ? 0 : Number(monto.replace(',', '.'));
    if (Number.isNaN(montoNumero) || montoNumero < 0) return setError('El monto cotizado no es válido.');
    setGuardando(true);
    try {
      const r = await completeVisit(visita.id, { serviceIds, quotedAmount: montoNumero, outcome: resultado, notes: notas.trim() });
      const base = r.oportunidadActualizada ? 'Visita completada y oferta sumada a la oportunidad.' : 'Visita completada.';
      if (r.oportunidadActualizada && oportunidad && etapaDestino && puedeMoverEtapa) {
        // La oportunidad fresca (con los servicios y el monto que acaba de recibir) para el cuadro de etapa.
        const fresca = await getOportunidad(oportunidad.id).catch(() => oportunidad);
        setAMoverEtapa({ oportunidad: fresca, destino: etapaDestino, mensaje: base });
        return;
      }
      onDone(base);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo completar la visita. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const nombreOportunidad = oportunidad
    ? oportunidad.title || oportunidad.services.map((s) => s.name).join(', ') || `Oportunidad ${oportunidad.id}`
    : '';

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Oferta comercial y cierre de la visita</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />
            <p style={{ fontSize: '0.85rem', color: '#718096', margin: '0 0 12px' }}>
              Visita a <strong>{visita.cliente?.name ?? visita.clientName}</strong>
            </p>

            <div className="form-group">
              <label>Oportunidad</label>
              {oportunidad ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                  <strong style={{ flex: 1, minWidth: 160 }}>{nombreOportunidad}</strong>
                  {oportunidad.stage && <span style={{ fontSize: 12.5, color: '#4a5568' }}>{oportunidad.stage.label}</span>}
                </div>
              ) : visita.salesClientId ? (
                <div>
                  <button type="button" className="btn-secondary" onClick={() => setCreandoOportunidad(true)}>
                    + Nueva oportunidad
                  </button>
                  <small style={{ display: 'block', color: '#a0aec0', marginTop: 4 }}>
                    Esta visita no tiene oportunidad. Si hay una negociación, créala aquí y queda ligada a la visita.
                  </small>
                </div>
              ) : (
                <small style={{ color: '#a0aec0' }}>Visita de antes del Directorio: no tiene oportunidad.</small>
              )}
            </div>

            <div className="form-group">
              <label>Productos y servicios ofrecidos {resultado !== 'NOT_INTERESTED' && '*'}</label>
              <ServiciosPorCategoria
                servicios={servicios.filter((s) => s.isActive || serviceIds.includes(s.id))}
                seleccionados={serviceIds}
                onToggle={alternar}
                marcarDesactivados
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Monto cotizado ($ USD)</label>
                <input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Resultado de la visita *</label>
                <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                  {RESULTADOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Notas de conclusión de la visita</label>
              <textarea className="form-textarea" rows={2} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones finales..." />
            </div>

            <div className="form-ayuda" role="note">
              <p>{aviso}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button className="auth-btn" onClick={completar} disabled={guardando}>{guardando ? 'Guardando...' : 'Completar visita'}</button>
          </div>
        </div>
      </div>

      {creandoOportunidad && visita.salesClientId && (
        <OportunidadModal
          modo="crear"
          clientes={cliente ? [cliente] : []}
          clienteIdInicial={visita.salesClientId}
          servicios={servicios}
          onClose={() => setCreandoOportunidad(false)}
          onSaved={crearOportunidad}
        />
      )}

      {aMoverEtapa && (
        <CambioEtapaOportunidadModal
          oportunidad={aMoverEtapa.oportunidad}
          etapas={etapas}
          destino={aMoverEtapa.destino}
          onDone={() => onDone(`${aMoverEtapa.mensaje} La oportunidad pasó a «${aMoverEtapa.destino.label}».`)}
          // Cancelar el cambio de etapa no deshace la visita: ya quedó completada y con su oferta.
          onCancel={() => onDone(`${aMoverEtapa.mensaje} La etapa de la oportunidad no cambió.`)}
        />
      )}
    </>
  );
}
