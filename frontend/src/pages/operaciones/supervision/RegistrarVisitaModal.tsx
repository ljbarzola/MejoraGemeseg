import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { registrarVisita } from '../../../services/supervision.service';
import type { GuardiaPresente } from '../../../types/supervision';

const OPCIONES: { valor: GuardiaPresente; texto: string }[] = [
  { valor: 'SI', texto: 'Sí estaba' },
  { valor: 'NO', texto: 'No estaba' },
  { valor: 'NO_APLICA', texto: 'No aplica' },
];

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * Registrar la visita a un punto de servicio desde el celular: ¿estaba el guardia?, una observación y,
 * si se quiere, una foto como evidencia. La hora se pone sola (se puede cambiar).
 */
export default function RegistrarVisitaModal({
  puestoId,
  puestoNombre,
  fecha,
  onClose,
  onRegistrada,
}: {
  puestoId: number;
  puestoNombre: string;
  /** AAAA-MM-DD; la de hoy salvo que se esté registrando un día atrasado. */
  fecha: string;
  onClose: () => void;
  onRegistrada: (guardiaPresente: GuardiaPresente) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [presente, setPresente] = useState<GuardiaPresente | ''>('');
  const [observacion, setObservacion] = useState('');
  const [hora, setHora] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (!foto) {
      setPrevia('');
      return;
    }
    const url = URL.createObjectURL(foto);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!presente) {
      setError('Indica si el guardia estaba en el puesto.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await registrarVisita({ puestoId, guardiaPresente: presente, observacion, fecha, hora: hora || undefined, foto });
      onRegistrada(presente);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo registrar la visita. Inténtalo de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Registrar visita</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            <p style={{ margin: '0 0 12px', fontWeight: 700 }}>{puestoNombre}<span style={{ fontWeight: 400, color: '#718096' }}> · {fechaLarga(fecha)}</span></p>
            {error && <div ref={errorRef} className="form-error">{error}</div>}

            <div className="form-group">
              <label>¿Estaba el guardia en el puesto? *</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {OPCIONES.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    className={presente === o.valor ? 'auth-btn' : 'btn-secondary'}
                    style={{ flex: '1 1 90px', minHeight: 44 }}
                    onClick={() => setPresente(o.valor)}
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
              {presente === 'NO' && (
                <small style={{ color: '#9c4221', display: 'block', marginTop: 6 }}>
                  Si el guardia no llegó, también regístralo con «No llegó» en el Resumen para que el sistema busque quién lo cubre.
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Observación</label>
              <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={3} maxLength={500} placeholder="Qué viste (opcional)" />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label>Hora</label>
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                <small style={{ color: '#718096' }}>Vacía = la hora actual</small>
              </div>
              <div className="form-group" style={{ flex: '2 1 180px' }}>
                <label>Foto (opcional)</label>
                <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 44 }}>
                  <Camera size={16} /> {foto ? 'Cambiar foto' : 'Tomar o elegir foto'}
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>
            {previa && <img src={previa} alt="Vista previa de la foto" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, marginTop: 4 }} />}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar visita'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
