import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { SALES_ACTIVITY_TYPES, type SalesActivityType, type SalesClientStage } from '../../services/ventas.service';

// Lo que se hizo con el cliente, para dejar en su línea de tiempo ("Hecho").
export interface ActividadHecha {
  type: SalesActivityType;
  otherLabel: string;
  text: string;
}

interface SiguientePasoModalProps {
  title: string;
  clientName: string;
  initialText?: string | null;
  // 'YYYY-MM-DD'
  initialDate?: string | null;
  // Dejar los dos campos vacíos y guardar quita el siguiente paso. Si
  // `conActividad`, el tercer argumento trae lo que se hizo (puede venir con
  // el texto vacío: entonces no se registra nada).
  onSave: (text: string, date: string, actividad?: ActividadHecha) => void | Promise<void>;
  // Pide además "¿Qué hiciste?" (tipo + texto) antes del siguiente paso.
  conActividad?: boolean;
  saveLabel?: string;
  // Cerrar con Cancelar o fuera del cuadro no hace nada.
  onCancel: () => void;
  // Cuando se está cambiando de etapa: muestra "pasará de X a Y".
  cambioEtapa?: { from: SalesClientStage | null; to: SalesClientStage };
  // Etapa final: no hay siguiente paso que pedir, solo se confirma el cambio.
  soloConfirmar?: boolean;
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid #ddd',
  fontSize: 13,
  boxSizing: 'border-box' as const,
};
// Los .btn-secondary / .auth-btn globales son grandes (pensados para
// formularios de pantalla completa); en un cuadro pequeño con tres acciones
// no caben en una fila.
const botonCompacto = { padding: '10px 18px', fontSize: '0.9rem', whiteSpace: 'nowrap' as const };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 };

function EtapaBadge({ stage }: { stage: SalesClientStage | null }) {
  const color = stage?.color || '#718096';
  return (
    <span className="status-badge" style={{ backgroundColor: color + '22', color, whiteSpace: 'nowrap' }}>
      {stage?.label || 'Sin etapa'}
    </span>
  );
}

// Ventanita "¿Cuál es el siguiente paso y cuándo?" — se usa al mover un
// cliente de etapa, al marcar "Hecho" en la vista Hoy y al editar el
// siguiente paso desde la tabla.
export default function SiguientePasoModal({
  title,
  clientName,
  initialText,
  initialDate,
  onSave,
  saveLabel = 'Guardar',
  onCancel,
  cambioEtapa,
  soloConfirmar = false,
  conActividad = false,
}: SiguientePasoModalProps) {
  const [text, setText] = useState(initialText || '');
  const [date, setDate] = useState(initialDate || '');
  const [busy, setBusy] = useState(false);
  const [actType, setActType] = useState<SalesActivityType>('LLAMADA');
  const [actOther, setActOther] = useState('');
  const [actText, setActText] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  const guardar = () => {
    if (conActividad && actText.trim() && actType === 'OTRO' && !actOther.trim()) {
      setErrorLocal('Escribe cómo quieres llamar a esta actividad.');
      return;
    }
    setErrorLocal('');
    return run(() =>
      onSave(
        soloConfirmar ? '' : text,
        soloConfirmar ? '' : date,
        conActividad ? { type: actType, otherLabel: actOther, text: actText } : undefined,
      ),
    );
  };

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conActividad && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>
                <strong>{clientName}</strong> — cuéntanos qué hiciste.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <label style={labelStyle}>Tipo</label>
                  <select value={actType} onChange={(e) => setActType(e.target.value as SalesActivityType)} style={{ ...inputStyle, width: 'auto' }}>
                    {SALES_ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {actType === 'OTRO' && (
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <label style={labelStyle}>¿Cuál?</label>
                    <input value={actOther} onChange={(e) => setActOther(e.target.value)} maxLength={40} placeholder="Ej: Visita a la obra" style={inputStyle} />
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>¿Qué hiciste? (opcional)</label>
                <textarea
                  value={actText}
                  onChange={(e) => setActText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  autoFocus
                  placeholder="Ej: Llamé, pidió cotización para 10 guardias."
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 13 }}>Y ahora, ¿cuál es el siguiente paso y cuándo?</p>
            </div>
          )}

          {cambioEtapa ? (
            <div style={{ color: '#2d3748', lineHeight: 1.6 }}>
              <strong>{clientName}</strong> pasará de etapa:
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <EtapaBadge stage={cambioEtapa.from} />
                <ArrowRight size={16} color="#718096" />
                <EtapaBadge stage={cambioEtapa.to} />
              </div>
            </div>
          ) : conActividad ? null : (
            <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>
              <strong>{clientName}</strong> — ¿cuál es el siguiente paso y cuándo?
            </p>
          )}

          {soloConfirmar ? (
            <p style={{ margin: 0, color: '#718096', fontSize: 13, lineHeight: 1.5 }}>
              Es una etapa final: se cierra el seguimiento y se borra el siguiente paso de este cliente.
            </p>
          ) : (
            <>
              {cambioEtapa && (
                <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>¿Cuál es el siguiente paso y cuándo?</p>
              )}
              <div>
                <label style={labelStyle}>Siguiente paso</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ej: Enviar cotización"
                  maxLength={200}
                  autoFocus={!conActividad}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Para cuándo</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
              <p style={{ margin: 0, color: '#a0aec0', fontSize: 12 }}>
                Si los dejas vacíos, el cliente queda sin siguiente paso.
              </p>
            </>
          )}
          {errorLocal && <p style={{ margin: 0, color: '#c53030', fontSize: 13 }}>{errorLocal}</p>}
        </div>
        <div className="modal-actions" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={busy} style={botonCompacto}>
            Cancelar
          </button>
          <button
            className="auth-btn"
            onClick={guardar}
            disabled={busy}
            style={botonCompacto}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
