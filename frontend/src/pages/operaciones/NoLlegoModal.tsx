import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cubrirAusencia, getSugerenciasAusencia, registrarAusencia } from '../../services/ausencias.service';
import type { MotivoAusencia, SugerenciaReemplazo } from '../../types/bitacoras';
import { MOTIVO_AUSENCIA_LABEL } from '../../types/bitacoras';
import EmpleadoSelect from '../../components/custodias/EmpleadoSelect';
import { mensajeError } from '../../utils/entregasCp';

const NINGUNO = '__ninguno__';
const OTRO = '__otro__';

const horaAhora = () => {
  // Hora de Ecuador (UTC-5) como HH:mm, para proponer la hora a la que se nota la falta.
  const d = new Date(Date.now() - 5 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * «No llegó»: registra la falta de un guardia en el momento, sin foto ni bitácora, y deja elegir quién cubre
 * entre los guardias que el horario muestra libres (el sistema solo sugiere). Con `cubrirId` solo asigna
 * quién cubre una falta que ya estaba registrada.
 */
export default function NoLlegoModal({
  puestoId,
  puestoNombre,
  guardia,
  fecha,
  cubrirId,
  onClose,
  onSaved,
}: {
  puestoId: number;
  puestoNombre: string;
  guardia: { cedula: string; nombre: string };
  /** Día de la falta (hoy). */
  fecha: string;
  /** Si viene, la falta ya existe y solo se elige quién cubre. */
  cubrirId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoAusencia>('NO_AVISO');
  const [hora, setHora] = useState(horaAhora());
  const [nota, setNota] = useState('');
  const [sugerencias, setSugerencias] = useState<SugerenciaReemplazo[] | null>(null);
  const [eleccion, setEleccion] = useState<string>(cubrirId ? '' : NINGUNO);
  const [otro, setOtro] = useState({ nombre: '', cedula: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSugerenciasAusencia(puestoId, guardia.cedula, fecha)
      .then(setSugerencias)
      .catch(() => setSugerencias([]));
  }, [puestoId, guardia.cedula, fecha]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const reemplazo = (): { cedula: string; nombre: string } | null => {
    if (eleccion === NINGUNO || eleccion === '') return null;
    if (eleccion === OTRO) return otro.cedula ? { cedula: otro.cedula, nombre: otro.nombre } : null;
    const s = sugerencias?.find((x) => x.cedula === eleccion);
    return s ? { cedula: s.cedula, nombre: s.nombre } : null;
  };

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = reemplazo();
    if (cubrirId && !r) return setError('Elige quién cubre.');
    if (eleccion === OTRO && !r) return setError('Elige al guardia que cubre.');
    setSaving(true);
    setError('');
    try {
      if (cubrirId) await cubrirAusencia(cubrirId, r!.cedula, r!.nombre);
      else
        await registrarAusencia({
          puestoId,
          cedula: guardia.cedula,
          fecha,
          motivo,
          hora: hora || null,
          nota: nota.trim() || null,
          reemplazoCedula: r?.cedula ?? null,
          reemplazoNombre: r?.nombre ?? null,
        });
      onSaved();
    } catch (err) {
      setError(mensajeError(err, cubrirId ? 'No se pudo asignar quién cubre.' : 'No se pudo registrar la falta.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{cubrirId ? 'Quién cubre' : 'No llegó'}: {guardia.nombre}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}
            <div style={{ fontSize: '0.85rem', color: '#4a5568' }}>Puesto: <strong>{puestoNombre}</strong></div>

            {!cubrirId && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '2 1 220px' }}>
                  <label>Motivo *</label>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAusencia)}>
                    {(Object.keys(MOTIVO_AUSENCIA_LABEL) as MotivoAusencia[]).map((m) => (
                      <option key={m} value={m}>{MOTIVO_AUSENCIA_LABEL[m]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label>Hora en que se notó</label>
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>¿Quién lo cubre?</label>
              {sugerencias === null ? (
                <div style={{ color: '#718096', fontSize: '0.85rem' }}>Buscando guardias libres…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sugerencias.map((s) => (
                    <label key={s.cedula} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input type="radio" name="reemplazo" checked={eleccion === s.cedula} onChange={() => setEleccion(s.cedula)} style={{ marginTop: 3 }} />
                      <span>
                        <strong style={{ fontWeight: 600 }}>{s.nombre}</strong>{' '}
                        <span style={{ color: '#718096' }}>· {s.mismoPuesto ? 'de este puesto' : `de ${s.puestoNombre}`} · {s.motivo}</span>
                        {s.aviso && <span style={{ color: '#975a16' }}> · Ojo: {s.aviso}</span>}
                      </span>
                    </label>
                  ))}
                  {sugerencias.length === 0 && (
                    <div style={{ color: '#718096', fontSize: '0.85rem' }}>Ningún guardia del contrato está libre ese día.</div>
                  )}
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input type="radio" name="reemplazo" checked={eleccion === OTRO} onChange={() => setEleccion(OTRO)} />
                    Otro guardia…
                  </label>
                  {eleccion === OTRO && <EmpleadoSelect label="" source="RRHH" value={otro} onChange={setOtro} />}
                  {!cubrirId && (
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input type="radio" name="reemplazo" checked={eleccion === NINGUNO} onChange={() => setEleccion(NINGUNO)} />
                      Todavía no sé: lo defino después
                    </label>
                  )}
                </div>
              )}
            </div>

            {!cubrirId && (
              <div className="form-group">
                <label>Nota (opcional)</label>
                <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: llamó su familiar, no contesta el celular" maxLength={300} />
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>
              {saving ? 'Guardando...' : cubrirId ? 'Asignar' : 'Registrar falta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
