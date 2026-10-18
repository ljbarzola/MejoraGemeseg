import { useEffect, useState, type ReactNode } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import {
  getMotivos,
  type MotivoInput,
  type MotivoKind,
  type SalesMotivo,
} from '../../services/ventas.service';
import { PREGUNTA_MOTIVO, grupoDeKind } from '../../utils/motivosCierre';

interface Props {
  kind: MotivoKind;
  titulo: string;
  // Qué se está cerrando (cliente, oportunidad, contrato...), para que la persona
  // vea de qué es el motivo que va a dar.
  descripcion?: ReactNode;
  confirmLabel: string;
  // Texto extra bajo el título (por ejemplo, qué cambia en la renovación).
  contexto?: ReactNode;
  // Hace el cierre de verdad. Si lanza, el mensaje se muestra aquí y el modal
  // se queda abierto; si termina bien, el que llama cierra el modal.
  onConfirm: (motivo: MotivoInput) => Promise<void>;
  onCancel: () => void;
}

// Todo cierre (descartar un posible cliente, perder una oportunidad, cancelar o no renovar
// un contrato, renovar con menos) se explica aquí, igual en todos lados. Los
// estudios de win/loss muestran que el motivo que anota el vendedor suele no ser
// el real, por eso se pregunta también QUIÉN lo dijo y existe «Sin información»:
// mejor decir que no se sabe que inventar un motivo para cumplir.
export default function MotivoCierreModal({
  kind, titulo, descripcion, confirmLabel, contexto, onConfirm, onCancel,
}: Props) {
  const [motivos, setMotivos] = useState<SalesMotivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [reasonId, setReasonId] = useState<number | ''>('');
  const [source, setSource] = useState<'CLIENTE' | 'VENDEDOR' | ''>('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getMotivos(kind)
      .then(setMotivos)
      .catch((err: any) => setError(err?.response?.data?.message || 'No se pudo cargar la lista de motivos.'))
      .finally(() => setCargando(false));
  }, [kind]);

  const elegido = motivos.find((m) => m.id === reasonId);

  const confirmar = async () => {
    setError('');
    if (!elegido) return setError('Elige el motivo. Si no se sabe, elige «Sin información».');
    if (elegido.requiresComment && !comentario.trim()) {
      return setError(`Con el motivo «${elegido.label}» hay que escribir un comentario.`);
    }
    if (!elegido.isNoInfo && !source) {
      return setError('Indica quién dio este motivo: el cliente, o es una suposición tuya.');
    }
    setGuardando(true);
    try {
      await onConfirm({
        reasonId: elegido.id,
        comment: comentario.trim() || undefined,
        source: elegido.isNoInfo ? undefined : (source as 'CLIENTE' | 'VENDEDOR'),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {descripcion && <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{descripcion}</p>}
          {contexto && <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>{contexto}</div>}

          <div className="form-group">
            <label>{PREGUNTA_MOTIVO[kind]} *</label>
            <select
              value={reasonId}
              disabled={cargando}
              onChange={(e) => {
                setReasonId(e.target.value ? Number(e.target.value) : '');
                setSource('');
              }}
            >
              <option value="">{cargando ? 'Cargando...' : 'Seleccionar motivo...'}</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              Lista «{grupoDeKind(kind).titulo}». Si no encuentras el motivo, elige «Otro» y explícalo, o pide que lo agreguen en Ventas → Configuración → Motivos de cierre.
            </p>
          </div>

          {elegido && !elegido.isNoInfo && (
            <div className="form-group">
              <label>¿Quién dio este motivo? *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {([
                  ['CLIENTE', 'Lo dijo el cliente (con sus palabras)'],
                  ['VENDEDOR', 'Es una suposición mía, el cliente no lo dijo'],
                ] as const).map(([valor, texto]) => (
                  <label key={valor} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                    <input type="radio" name="origen-motivo" checked={source === valor} onChange={() => setSource(valor)} />
                    {texto}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#888', margin: '6px 0 0' }}>
                Se guarda así para no confundir lo que dijo el cliente con lo que se supone.
              </p>
            </div>
          )}
          {elegido?.isNoInfo && (
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
              Queda registrado que no se sabe por qué. Si más adelante lo averiguas, puedes anotarlo como una nota del cliente.
            </p>
          )}

          <div className="form-group">
            <label>Comentario {elegido?.requiresComment ? '*' : '(opcional)'}</label>
            <textarea
              className="form-textarea"
              rows={3}
              maxLength={1000}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Qué pasó, con tus palabras o las del cliente."
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={guardando}>Cancelar</button>
          <button className="auth-btn" onClick={confirmar} disabled={guardando || cargando}>
            {guardando ? 'Guardando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
