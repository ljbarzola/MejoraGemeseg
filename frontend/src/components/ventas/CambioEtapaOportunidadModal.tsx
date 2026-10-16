import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import DateInput from '../common/DateInput';
import MotivoCierreModal from './MotivoCierreModal';
import {
  cambiarEtapaOportunidad,
  type Oportunidad,
  type SalesClientStage,
} from '../../services/ventas.service';

interface Props {
  oportunidad: Oportunidad;
  etapas: SalesClientStage[];
  destino: SalesClientStage;
  onDone: (o: Oportunidad) => void;
  onCancel: () => void;
}

const Badge = ({ label, color }: { label: string; color?: string }) => (
  <span className="status-badge" style={{ backgroundColor: (color || '#718096') + '22', color: color || '#718096', whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

// Cambio de etapa de UNA oportunidad. Cada destino pide lo que le corresponde:
// Perder la oportunidad exige el motivo (MotivoCierreModal), Cotizada pide el
// monto y la fecha, y el resto solo se confirma. Es el único lugar donde se
// cambia la etapa.
export default function CambioEtapaOportunidadModal({ oportunidad, etapas, destino, onDone, onCancel }: Props) {
  const origen = etapas.find((e) => e.key === oportunidad.status) ?? null;
  const [monto, setMonto] = useState(oportunidad.quotedAmount != null ? String(oportunidad.quotedAmount) : '');
  const [fecha, setFecha] = useState(oportunidad.quotedAt ? oportunidad.quotedAt.slice(0, 10) : '');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esPerdida = destino.key === 'RECHAZADO';
  const esCotizado = destino.key === 'COTIZADO';

  if (esPerdida) {
    return (
      <MotivoCierreModal
        kind="OPP_PERDIDA"
        titulo="¿Por qué se perdió?"
        descripcion={`${oportunidad.salesClient.name}${oportunidad.title ? ` · ${oportunidad.title}` : ''}`}
        confirmLabel="Marcar como perdida"
        onConfirm={async (motivo) => {
          onDone(await cambiarEtapaOportunidad(oportunidad.id, { toStatus: destino.key, motivo }));
        }}
        onCancel={onCancel}
      />
    );
  }

  const confirmar = async () => {
    setError('');
    const montoNumero = monto.trim() === '' ? undefined : Number(monto.replace(',', '.'));
    if (esCotizado && montoNumero !== undefined && (Number.isNaN(montoNumero) || montoNumero < 0)) {
      return setError('El monto cotizado no es válido.');
    }
    setGuardando(true);
    try {
      onDone(
        await cambiarEtapaOportunidad(oportunidad.id, {
          toStatus: destino.key,
          notes: notas.trim() || undefined,
          ...(esCotizado ? { quotedAmount: montoNumero ?? null, ...(fecha ? { quotedAt: fecha } : {}) } : {}),
        }),
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo cambiar la etapa. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cambiar de etapa</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
            {oportunidad.salesClient.name}{oportunidad.title ? ` · ${oportunidad.title}` : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Badge label={origen?.label ?? 'Sin etapa'} color={origen?.color} />
            <ArrowRight size={16} color="#718096" />
            <Badge label={destino.label} color={destino.color} />
          </div>

          {esCotizado && (
            <div className="form-row">
              <div className="form-group">
                <label>Monto cotizado (opcional)</label>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 3000" autoFocus />
              </div>
              <div className="form-group">
                <label>Cotizada el (por defecto hoy)</label>
                <DateInput value={fecha} onChange={setFecha} />
              </div>
            </div>
          )}

          {destino.isFinal && (
            <p style={{ fontSize: 13, color: '#718096', margin: '0 0 10px' }}>
              Es una etapa final: la oportunidad se cierra y se borra el siguiente paso del cliente si esta era su oportunidad principal.
            </p>
          )}

          <div className="form-group">
            <label>Nota del cambio (opcional)</label>
            <textarea className="form-textarea" rows={2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={guardando}>Cancelar</button>
          <button className="auth-btn" onClick={confirmar} disabled={guardando}>
            {guardando ? 'Guardando...' : destino.isFinal ? 'Confirmar cambio' : 'Cambiar de etapa'}
          </button>
        </div>
      </div>
    </div>
  );
}
