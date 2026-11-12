import { useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import { anotarHorasDebidas, mensajeErrorBitacora } from '../../services/bitacora.service';
import { hoyEcuador } from '../../utils/bitacoraFechas';

interface Props {
  /** Solo administradores y gerentes: elegir a quién se le anotan. Sin esto, se anotan a la propia persona. */
  personas?: { userId: number; nombre: string }[];
  /** Persona preelegida (solo con `personas`). */
  personaInicial?: number;
  onCerrar: () => void;
  onGuardado: () => void;
}

/** Anota horas que se deben (permiso, atraso, salida antes). Suman a la deuda del saldo de horas. */
export default function AnotarHorasModal({ personas, personaInicial, onCerrar, onGuardado }: Props) {
  const [userId, setUserId] = useState<number | ''>(personaInicial ?? '');
  const [horas, setHoras] = useState('0');
  const [minutos, setMinutos] = useState('0');
  const [fecha, setFecha] = useState(hoyEcuador());
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setError('');
    if (personas && userId === '') {
      setError('Elige a quién se le anotan las horas.');
      return;
    }
    const total = (Number(horas) || 0) * 60 + (Number(minutos) || 0);
    if (!Number.isInteger(total) || total < 1) {
      setError('Escribe cuánto tiempo se debe, en horas y minutos.');
      return;
    }
    if (motivo.trim().length < 3) {
      setError('Escribe el motivo, por ejemplo «permiso médico».');
      return;
    }
    setGuardando(true);
    try {
      await anotarHorasDebidas({
        userId: personas ? Number(userId) : undefined,
        minutos: total,
        motivo: motivo.trim(),
        fecha,
      });
      onGuardado();
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{personas ? 'Anotar horas que debe' : 'Anotar horas que debo'}</h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p className="bit-nota" style={{ marginTop: 0 }}>
            Es el tiempo que se debe recuperar (un permiso, un atraso, salir antes). Se resta de tu saldo y lo vas
            pagando con tiempo extra aprobado.
          </p>

          {personas && (
            <div className="form-group">
              <label>Persona *</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Elegir persona...</option>
                {personas.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Horas</label>
              <input type="number" min={0} max={24} value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Minutos</label>
              <input type="number" min={0} max={59} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Día al que corresponde</label>
            <input type="date" value={fecha} max={hoyEcuador()} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Motivo *</label>
            <input
              type="text"
              maxLength={200}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por ejemplo: permiso médico"
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="auth-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Anotar'}
          </button>
        </div>
      </div>
    </div>
  );
}
