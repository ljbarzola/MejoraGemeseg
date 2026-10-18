import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon, Lock } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import {
  getMotivos,
  createMotivo,
  updateMotivo,
  deleteMotivo,
  type MotivoKind,
  type SalesMotivo,
} from '../../services/ventas.service';
import {
  GRUPOS_MOTIVOS,
  ETIQUETA_CIERRE,
  ETIQUETA_CIERRE_CORTA,
  type GrupoMotivoClave,
  type GrupoMotivos,
} from '../../utils/motivosCierre';

const inputStyle = { padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 };
const checkStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 400 } as const;

interface Props {
  // Qué grupos mostrar (por defecto, los tres). El modal de Contratos solo muestra el suyo.
  grupos?: GrupoMotivoClave[];
  // Sin permiso de edición solo se ven (el servidor también lo exige).
  puedeEditar?: boolean;
}

// Catálogo de motivos de cierre de la empresa, separado en los tres niveles del
// embudo: posible cliente descartado, oportunidad perdida y contrato terminado.
// Cada nivel tiene SU lista; un mismo motivo («Precio») puede estar en más de una.
// Los marcados con candado los usa el sistema y no se tocan.
export default function MotivosCatalogo({ grupos, puedeEditar = true }: Props) {
  const visibles = GRUPOS_MOTIVOS.filter((g) => !grupos || grupos.includes(g.clave));
  const [motivos, setMotivos] = useState<SalesMotivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
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

  const guardarEdicion = () => {
    if (editId == null) return;
    if (!editLabel.trim()) return setError('El nombre no puede quedar vacío.');
    if (editKinds.length === 0) return setError('Elige en qué casos se usa este motivo.');
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
    <div>
      <ErrorBanner mensaje={error} />
      {cargando ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : (
        visibles.map((g) => (
          <GrupoMotivosCaja
            key={g.clave}
            grupo={g}
            motivos={motivos.filter((m) => m.kinds.some((k) => g.kinds.includes(k)))}
            puedeEditar={puedeEditar}
            editId={editId}
            editLabel={editLabel}
            editKinds={editKinds}
            setEditLabel={setEditLabel}
            alternarEditKind={(k) => setEditKinds((l) => alternar(l, k))}
            onEditar={(m) => { setEditId(m.id); setEditLabel(m.label); setEditKinds(m.kinds); }}
            onGuardarEdicion={guardarEdicion}
            onCancelarEdicion={() => setEditId(null)}
            onBorrar={setABorrar}
            onActivar={(m, activo) => correr(() => updateMotivo(m.id, { isActive: activo }), 'No se pudo cambiar el motivo.')}
            onCrear={(label, kinds, requiereComentario) =>
              correr(() => createMotivo({ label, kinds, requiresComment: requiereComentario }), 'No se pudo crear el motivo.')}
            onError={setError}
          />
        ))
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar motivo"
          message={`¿Eliminar el motivo «${aBorrar.label}»? Si ya se usó en algún cierre, no se podrá borrar y tendrás que desactivarlo: así deja de ofrecerse pero se conserva en lo ya registrado.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarBorrado}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}

interface CajaProps {
  grupo: GrupoMotivos;
  motivos: SalesMotivo[];
  puedeEditar: boolean;
  editId: number | null;
  editLabel: string;
  editKinds: MotivoKind[];
  setEditLabel: (v: string) => void;
  alternarEditKind: (k: MotivoKind) => void;
  onEditar: (m: SalesMotivo) => void;
  onGuardarEdicion: () => void;
  onCancelarEdicion: () => void;
  onBorrar: (m: SalesMotivo) => void;
  onActivar: (m: SalesMotivo, activo: boolean) => void;
  onCrear: (label: string, kinds: MotivoKind[], requiereComentario: boolean) => void;
  onError: (msg: string) => void;
}

function GrupoMotivosCaja({
  grupo, motivos, puedeEditar, editId, editLabel, editKinds, setEditLabel, alternarEditKind,
  onEditar, onGuardarEdicion, onCancelarEdicion, onBorrar, onActivar, onCrear, onError,
}: CajaProps) {
  const varios = grupo.kinds.length > 1;
  const [nuevo, setNuevo] = useState('');
  const [nuevosKinds, setNuevosKinds] = useState<MotivoKind[]>(grupo.kinds);
  const [exigirComentario, setExigirComentario] = useState(false);

  const agregar = () => {
    if (!nuevo.trim()) return onError('Escribe el nombre del motivo.');
    if (nuevosKinds.length === 0) return onError('Elige en qué casos se usa este motivo.');
    onCrear(nuevo.trim(), nuevosKinds, exigirComentario);
    setNuevo('');
    setExigirComentario(false);
  };

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 2px', fontSize: 15 }}>{grupo.titulo}</h4>
      <p style={{ fontSize: 12, color: '#4a5568', margin: '0 0 2px', fontWeight: 600 }}>{grupo.donde}</p>
      <p style={{ fontSize: 12, color: '#718096', margin: '0 0 10px' }}>{grupo.ejemplos}</p>

      {puedeEditar && (
        <div style={{ background: '#f7fafc', borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: varios ? 8 : 0 }}>
            <input
              type="text" value={nuevo} maxLength={80}
              placeholder="Escribe un motivo nuevo para esta lista"
              aria-label={`Nuevo motivo: ${grupo.titulo}`}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              style={{ ...inputStyle, flex: '1 1 240px' }}
            />
            <button className="auth-btn" onClick={agregar}>Agregar</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
            {varios && grupo.kinds.map((k) => (
              <label key={k} style={checkStyle}>
                <input
                  type="checkbox" checked={nuevosKinds.includes(k)}
                  onChange={() => setNuevosKinds((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))}
                />
                {ETIQUETA_CIERRE[k]}
              </label>
            ))}
            <label style={checkStyle}>
              <input type="checkbox" checked={exigirComentario} onChange={(e) => setExigirComentario(e.target.checked)} />
              Exigir comentario al elegirlo
            </label>
          </div>
        </div>
      )}

      <div className="tasks-table-wrapper">
        <table className="tasks-table">
          <thead>
            <tr>
              <th>Motivo</th>
              {varios && <th>Se usa cuando</th>}
              <th>Se ofrece</th>
              {puedeEditar && <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {motivos.length === 0 && (
              <tr><td colSpan={4} style={{ color: '#888', fontSize: 13 }}>Aún no hay motivos para esto.</td></tr>
            )}
            {motivos.map((m) => {
              const enEdicion = editId === m.id;
              const otros = m.kinds.filter((k) => !grupo.kinds.includes(k));
              return (
                <tr key={m.id} style={m.isActive ? undefined : { opacity: 0.6 }}>
                  <td>
                    {enEdicion ? (
                      <input value={editLabel} maxLength={80} onChange={(e) => setEditLabel(e.target.value)}
                        aria-label="Nombre del motivo" style={{ ...inputStyle, width: '100%', padding: '5px 8px' }} />
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{m.label}</span>
                        {m.isSystem && <Lock size={12} style={{ marginLeft: 6, color: '#999' }} aria-label="Lo usa el sistema" />}
                        {m.requiresComment && <div style={{ fontSize: 11, color: '#888' }}>Exige comentario</div>}
                        {otros.length > 0 && m.kinds.length === Object.keys(ETIQUETA_CIERRE).length && (
                          <div style={{ fontSize: 11, color: '#888' }}>Se ofrece en los tres niveles</div>
                        )}
                        {otros.length > 0 && m.kinds.length < Object.keys(ETIQUETA_CIERRE).length && (
                          <div style={{ fontSize: 11, color: '#888' }}>
                            También se usa en: {[...new Set(otros.map((k) => (GRUPOS_MOTIVOS.find((x) => x.kinds.includes(k))?.titulo ?? ETIQUETA_CIERRE[k]).toLowerCase()))].join('; ')}
                          </div>
                        )}
                      </>
                    )}
                    {enEdicion && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#718096' }}>Se usa en:</span>
                        {GRUPOS_MOTIVOS.map((gr) => (
                          <div key={gr.clave}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#4a5568' }}>{gr.titulo}</div>
                            {gr.kinds.map((k) => (
                              <label key={k} style={checkStyle}>
                                <input type="checkbox" checked={editKinds.includes(k)} onChange={() => alternarEditKind(k)} />
                                {ETIQUETA_CIERRE[k]}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  {varios && (
                    <td style={{ fontSize: 12 }}>
                      {m.kinds.filter((k) => grupo.kinds.includes(k)).map((k) => ETIQUETA_CIERRE_CORTA[k]).join(', ')}
                    </td>
                  )}
                  <td>
                    <label style={{ ...checkStyle, fontSize: 12 }}>
                      <input
                        type="checkbox" checked={m.isActive} disabled={m.isSystem || !puedeEditar}
                        aria-label={`Ofrecer el motivo ${m.label}`}
                        onChange={(e) => onActivar(m, e.target.checked)}
                      />
                      {m.isActive ? 'Sí' : 'No'}
                    </label>
                  </td>
                  {puedeEditar && (
                    <td className="col-acciones col-acciones--ancha">
                      <div className="acciones-iconos">
                        {m.isSystem ? (
                          <span className="icon-btn" aria-hidden="true" />
                        ) : enEdicion ? (
                          <>
                            <button className="icon-btn" title="Guardar" aria-label="Guardar" onClick={onGuardarEdicion}><Check size={15} /></button>
                            <button className="icon-btn" title="Cancelar" aria-label="Cancelar" onClick={onCancelarEdicion}><XIcon size={15} /></button>
                          </>
                        ) : (
                          <>
                            <button className="icon-btn" title="Editar" aria-label={`Editar ${m.label}`} onClick={() => onEditar(m)}>
                              <Pencil size={15} />
                            </button>
                            <button className="icon-btn" title="Eliminar" aria-label={`Eliminar ${m.label}`} onClick={() => onBorrar(m)}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
