import { useState } from 'react';
import { SALES_ACTIVITY_TYPES, type SalesActivityType } from '../../services/ventas.service';

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
}

// Ventanita "¿Cuál es el siguiente paso y cuándo?" — se usa al marcar "Hecho"
// en la vista Hoy y al editar el siguiente paso desde las tablas. La etapa ya
// no se cambia aquí: solo en Oportunidades.
export default function SiguientePasoModal({
  title,
  clientName,
  initialText,
  initialDate,
  onSave,
  saveLabel = 'Guardar',
  onCancel,
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
        text,
        date,
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
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conActividad && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>
                <strong>{clientName}</strong> — cuéntanos qué hiciste.
              </p>
              <div className="ficha-grid">
                <div className="form-group">
                  <label>Tipo</label>
                  <select value={actType} onChange={(e) => setActType(e.target.value as SalesActivityType)}>
                    {SALES_ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {actType === 'OTRO' && (
                  <div className="form-group">
                    <label>¿Cuál?</label>
                    <input value={actOther} onChange={(e) => setActOther(e.target.value)} maxLength={40} placeholder="Ej: Visita a la obra" />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>¿Qué hiciste? (opcional)</label>
                <textarea
                  value={actText}
                  onChange={(e) => setActText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  autoFocus
                  placeholder="Ej: Llamé, pidió cotización para 10 guardias."
                />
              </div>
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 13 }}>Y ahora, ¿cuál es el siguiente paso y cuándo?</p>
            </div>
          )}

          {conActividad ? null : (
            <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>
              <strong>{clientName}</strong> — ¿cuál es el siguiente paso y cuándo?
            </p>
          )}

          <div className="form-group">
            <label>Siguiente paso</label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ej: Enviar cotización"
              maxLength={200}
              autoFocus={!conActividad}
            />
          </div>
          <div className="form-group">
            <label>Para cuándo</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <p style={{ margin: 0, color: '#a0aec0', fontSize: 12 }}>
            Si los dejas vacíos, queda sin siguiente paso.
          </p>
          {errorLocal && <p style={{ margin: 0, color: '#c53030', fontSize: 13 }}>{errorLocal}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            className="auth-btn"
            onClick={guardar}
            disabled={busy}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
