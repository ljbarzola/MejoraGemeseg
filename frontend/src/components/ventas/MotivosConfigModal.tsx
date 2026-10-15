import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon, Lock } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import {
  getMotivos,
  createMotivo,
  updateMotivo,
  deleteMotivo,
  MOTIVO_KIND_LABEL,
  type MotivoKind,
  type SalesMotivo,
} from '../../services/ventas.service';

const KINDS = Object.keys(MOTIVO_KIND_LABEL) as MotivoKind[];
const inputStyle = { padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 };

// Catálogo de motivos de cierre de la empresa (por qué se descarta un lead, se
// pierde una oportunidad o se cancela, reduce o no se renueva un contrato). Los
// marcados con candado los usa el sistema y no se tocan.
export default function MotivosConfigModal({ onClose }: { onClose: () => void }) {
  const [motivos, setMotivos] = useState<SalesMotivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [nuevosKinds, setNuevosKinds] = useState<MotivoKind[]>(['OPP_PERDIDA']);
  const [nuevoComentario, setNuevoComentario] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editKinds, setEditKinds] = useState<MotivoKind[]>([]);
  const [aBorrar, setABorrar] = useState<SalesMotivo | null>(null);

  const cargar = async () => {
    try {
      setMotivos(await getMotivos(undefined, true));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar la lista de motivos.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const correr = async (fn: () => Promise<unknown>, falla: string) => {
    setError('');
    try {
      await fn();
      await cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || falla);
    }
  };

  const alternar = (lista: MotivoKind[], k: MotivoKind) =>
    lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k];

  const agregar = () => {
    if (!nuevo.trim()) return setError('Escribe el nombre del motivo.');
    if (nuevosKinds.length === 0) return setError('Elige en qué cierres se usa este motivo.');
    correr(async () => {
      await createMotivo({ label: nuevo.trim(), kinds: nuevosKinds, requiresComment: nuevoComentario });
      setNuevo('');
      setNuevoComentario(false);
    }, 'No se pudo crear el motivo.');
  };

  const guardarEdicion = () => {
    if (editId == null) return;
    if (!editLabel.trim()) return setError('El nombre no puede quedar vacío.');
    if (editKinds.length === 0) return setError('Elige en qué cierres se usa este motivo.');
    correr(async () => {
      await updateMotivo(editId, { label: editLabel.trim(), kinds: editKinds });
      setEditId(null);
    }, 'No se pudo guardar el motivo.');
  };

  const confirmarBorrado = () => {
    const m = aBorrar;
    setABorrar(null);
    if (!m) return;
    correr(() => deleteMotivo(m.id), 'No se pudo eliminar el motivo.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Motivos de cierre</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Las opciones que se ofrecen al descartar un lead, perder una oportunidad o cancelar, reducir o no renovar un contrato. Si un motivo ya se usó, no se borra: se desactiva para que deje de ofrecerse sin perder lo registrado.
          </p>
          <ErrorBanner mensaje={error} />

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input
                type="text" value={nuevo} maxLength={80} placeholder="Nuevo motivo"
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
                style={{ ...inputStyle, flex: '1 1 220px' }}
              />
              <button className="auth-btn" onClick={agregar}>Agregar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {KINDS.map((k) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 400 }}>
                  <input type="checkbox" checked={nuevosKinds.includes(k)} onChange={() => setNuevosKinds(alternar(nuevosKinds, k))} />
                  {MOTIVO_KIND_LABEL[k]}
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 400 }}>
                <input type="checkbox" checked={nuevoComentario} onChange={(e) => setNuevoComentario(e.target.checked)} />
                Exigir comentario
              </label>
            </div>
          </div>

          {cargando ? (
            <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Motivo</th>
                    <th>Se usa en</th>
                    <th>Activo</th>
                    <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {motivos.map((m) => (
                    <tr key={m.id} style={m.isActive ? undefined : { opacity: 0.6 }}>
                      <td>
                        {editId === m.id ? (
                          <input value={editLabel} maxLength={80} onChange={(e) => setEditLabel(e.target.value)} style={{ ...inputStyle, width: '100%', padding: '5px 8px' }} />
                        ) : (
                          <>
                            <span style={{ fontWeight: 600 }}>{m.label}</span>
                            {m.isSystem && <Lock size={12} style={{ marginLeft: 6, color: '#999' }} aria-label="Lo usa el sistema" />}
                            {m.requiresComment && <div style={{ fontSize: 11, color: '#888' }}>Exige comentario</div>}
                          </>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {editId === m.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {KINDS.map((k) => (
                              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400 }}>
                                <input type="checkbox" checked={editKinds.includes(k)} onChange={() => setEditKinds(alternar(editKinds, k))} />
                                {MOTIVO_KIND_LABEL[k]}
                              </label>
                            ))}
                          </div>
                        ) : (
                          m.kinds.map((k) => MOTIVO_KIND_LABEL[k]).join(', ')
                        )}
                      </td>
                      <td>
                        <input
                          type="checkbox" checked={m.isActive} disabled={m.isSystem}
                          aria-label={`Motivo ${m.label} activo`}
                          onChange={(e) => correr(() => updateMotivo(m.id, { isActive: e.target.checked }), 'No se pudo cambiar el motivo.')}
                        />
                      </td>
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos">
                          {m.isSystem ? (
                            <span className="icon-btn" aria-hidden="true" />
                          ) : editId === m.id ? (
                            <>
                              <button className="icon-btn" title="Guardar" aria-label="Guardar" onClick={guardarEdicion}><Check size={15} /></button>
                              <button className="icon-btn" title="Cancelar" aria-label="Cancelar" onClick={() => setEditId(null)}><XIcon size={15} /></button>
                            </>
                          ) : (
                            <>
                              <button className="icon-btn" title="Editar" aria-label={`Editar ${m.label}`}
                                onClick={() => { setEditId(m.id); setEditLabel(m.label); setEditKinds(m.kinds); }}>
                                <Pencil size={15} />
                              </button>
                              <button className="icon-btn" title="Eliminar" aria-label={`Eliminar ${m.label}`} onClick={() => setABorrar(m)}>
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar motivo"
          message={`¿Eliminar «${aBorrar.label}»? Si ya se usó en algún cierre, no se podrá borrar y tendrás que desactivarlo.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarBorrado}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
