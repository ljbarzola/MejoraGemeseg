import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  actualizarArma,
  asignarArma,
  bajaArma,
  crearArma,
  devolverArma,
  getEventosArma,
  mantenimientoArma,
} from '../../../services/inventario.service';
import type { Arma, ClaseArma, EventoArma } from '../../../types/inventario';
import { CLASE_ARMA_LABEL } from '../../../types/inventario';
import DateInput from '../../../components/common/DateInput';
import EmpleadoSelect from '../../../components/custodias/EmpleadoSelect';
import { formatoFecha, mensajeError } from './inventarioUi';

function useScrollAlError(error: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);
  return ref;
}

/** Registrar un arma o corregir sus datos. El estado (asignada, mantenimiento…) se cambia con sus propias acciones. */
export function ArmaModal({ arma, onClose, onSaved }: { arma: Arma | null; onClose: () => void; onSaved: () => void }) {
  const [serie, setSerie] = useState(arma?.serie ?? '');
  const [clase, setClase] = useState<ClaseArma>(arma?.clase ?? 'PISTOLA');
  const [marca, setMarca] = useState(arma?.marca ?? '');
  const [modelo, setModelo] = useState(arma?.modelo ?? '');
  const [calibre, setCalibre] = useState(arma?.calibre ?? '');
  const [permisoNumero, setPermisoNumero] = useState(arma?.permisoNumero ?? '');
  const [permisoVence, setPermisoVence] = useState(arma?.permisoVence ?? '');
  const [notas, setNotas] = useState(arma?.notas ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useScrollAlError(error);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!serie.trim()) return setError('Escribe el número de serie del arma.');
    setSaving(true);
    setError('');
    try {
      const datos = {
        serie: serie.trim(),
        clase,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        calibre: calibre.trim() || null,
        permisoNumero: permisoNumero.trim() || null,
        permisoVence: permisoVence || null,
        notas: notas.trim() || null,
      };
      if (arma) await actualizarArma(arma.id, datos);
      else await crearArma(datos);
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el arma.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{arma ? 'Editar arma' : 'Nueva arma'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label>Número de serie *</label>
                <input type="text" value={serie} onChange={(e) => setSerie(e.target.value)} required />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Clase</label>
                <select value={clase} onChange={(e) => setClase(e.target.value as ClaseArma)}>
                  {(Object.keys(CLASE_ARMA_LABEL) as ClaseArma[]).map((c) => <option key={c} value={c}>{CLASE_ARMA_LABEL[c]}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Marca</label>
                <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Modelo</label>
                <input type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label>Calibre</label>
                <input type="text" value={calibre} onChange={(e) => setCalibre(e.target.value)} placeholder="9 mm" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>N.º de permiso</label>
                <input type="text" value={permisoNumero} onChange={(e) => setPermisoNumero(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>El permiso vence</label>
                <DateInput value={permisoVence} onChange={setPermisoVence} />
                <small style={{ color: '#718096' }}>Se avisa 30 días antes y no se puede asignar un arma con el permiso vencido.</small>
              </div>
            </div>
            <div className="form-group">
              <label>Notas</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando...' : arma ? 'Guardar cambios' : 'Registrar arma'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Asignar un arma disponible a un guardia, a un puesto o a ambos (un guardia en un puesto). */
export function AsignarArmaModal({
  arma,
  puestos,
  onClose,
  onSaved,
}: {
  arma: Arma;
  puestos: { id: number; texto: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guardia, setGuardia] = useState({ nombre: '', cedula: '' });
  const [puestoId, setPuestoId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useScrollAlError(error);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!guardia.cedula && !puestoId) return setError('Elige un guardia, un puesto o ambos.');
    setSaving(true);
    setError('');
    try {
      await asignarArma(arma.id, {
        puestoId: puestoId ? Number(puestoId) : null,
        guardiaCedula: guardia.cedula || null,
        guardiaNombre: guardia.nombre || null,
      });
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo asignar el arma.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Asignar arma {arma.serie}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}
            <EmpleadoSelect label="Guardia" source="RRHH" value={guardia} onChange={setGuardia} />
            <div className="form-group">
              <label>Puesto</label>
              <select value={puestoId} onChange={(e) => setPuestoId(e.target.value)}>
                <option value="">-- Sin puesto --</option>
                {puestos.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Asignando...' : 'Asignar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type AccionArma = 'DEVOLVER' | 'MANTENIMIENTO' | 'BAJA';

const TEXTOS: Record<AccionArma, { titulo: string; boton: string; etiqueta: string; obligatorio: boolean; ayuda: string }> = {
  DEVOLVER: { titulo: 'Devolver arma', boton: 'Devolver a la bodega', etiqueta: 'Observación', obligatorio: false, ayuda: 'Queda disponible en la bodega. Ej: estado en que vuelve.' },
  MANTENIMIENTO: { titulo: 'Enviar a mantenimiento', boton: 'Enviar a mantenimiento', etiqueta: 'Qué necesita', obligatorio: true, ayuda: 'No se podrá asignar hasta que la reactives.' },
  BAJA: { titulo: 'Dar de baja el arma', boton: 'Dar de baja', etiqueta: 'Motivo de la baja', obligatorio: true, ayuda: 'Deja de contar como arma de la empresa. El historial se conserva.' },
};

/** Devolver, mandar a mantenimiento o dar de baja: las tres piden (o permiten) una nota que queda en el historial. */
export function AccionArmaModal({ arma, accion, onClose, onSaved }: { arma: Arma; accion: AccionArma; onClose: () => void; onSaved: () => void }) {
  const t = TEXTOS[accion];
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useScrollAlError(error);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (t.obligatorio && !motivo.trim()) return setError(`Escribe: ${t.etiqueta.toLowerCase()}.`);
    setSaving(true);
    setError('');
    try {
      if (accion === 'DEVOLVER') await devolverArma(arma.id, motivo.trim() || undefined);
      else if (accion === 'MANTENIMIENTO') await mantenimientoArma(arma.id, motivo.trim());
      else await bajaArma(arma.id, motivo.trim());
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo completar la acción.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t.titulo} {arma.serie}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}
            <div className="form-group">
              <label>{t.etiqueta}{t.obligatorio ? ' *' : ''}</label>
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
              <small style={{ color: '#718096' }}>{t.ayuda}</small>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving} style={accion === 'BAJA' ? { background: '#c53030' } : undefined}>{saving ? 'Guardando...' : t.boton}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EVENTO_LABEL: Record<string, string> = {
  ALTA: 'Registrada',
  ASIGNACION: 'Asignada',
  DEVOLUCION: 'Devuelta',
  MANTENIMIENTO: 'A mantenimiento',
  REACTIVACION: 'Reactivada',
  BAJA: 'Dada de baja',
  EDICION: 'Datos editados',
};

/** Historial de un arma: quién la tuvo, cuándo y qué se hizo. */
export function HistorialArmaModal({ arma, onClose }: { arma: Arma; onClose: () => void }) {
  const [eventos, setEventos] = useState<EventoArma[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getEventosArma(arma.id).then(setEventos).catch((err) => setError(mensajeError(err, 'No se pudo cargar el historial.')));
  }, [arma.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Historial del arma {arma.serie}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          {!eventos && !error && <div className="loading-state">Cargando...</div>}
          {eventos && eventos.length === 0 && <div className="empty-state">Sin movimientos.</div>}
          {eventos && eventos.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {eventos.map((e) => (
                <li key={e.id} style={{ borderLeft: '3px solid #cbd5e0', paddingLeft: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{EVENTO_LABEL[e.tipo] ?? e.tipo}</div>
                  {e.detalle && <div style={{ fontSize: '0.85rem' }}>{e.detalle}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>{formatoFecha(e.createdAt)} · {e.porNombre}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
