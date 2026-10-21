import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon, Lock, FileX, TrendingDown, UserX } from 'lucide-react';
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
        <div className="cfg-mot-cols">{visibles.map((g) => {
          return (
          <GrupoMotivosColumna
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
          );
        })}</div>
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

const ICONO_GRUPO = { POSIBLE_CLIENTE: UserX, OPORTUNIDAD: TrendingDown, CONTRATO: FileX } as const;

// Una de las tres listas, como columna: título, cuándo se pide, un campo para agregar y los motivos
// en filas compactas (interruptor para ofrecerlo o no, lápiz y papelera). Los marcados con candado
// los usa el sistema: no se desactivan ni se tocan.
function GrupoMotivosColumna({
  grupo, motivos, puedeEditar, editId, editLabel, editKinds, setEditLabel, alternarEditKind,
  onEditar, onGuardarEdicion, onCancelarEdicion, onBorrar, onActivar, onCrear, onError,
}: CajaProps) {
  const varios = grupo.kinds.length > 1;
  const Icono = ICONO_GRUPO[grupo.clave];
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

  // Una sola línea de aclaraciones bajo el nombre, en vez de una por dato.
  const notasDe = (m: SalesMotivo) => {
    const notas: string[] = [];
    if (m.requiresComment) notas.push('Exige comentario');
    // Dentro de una lista con varios casos (Contratos), solo se aclara cuando el motivo NO sirve para todos.
    const delGrupo = m.kinds.filter((k) => grupo.kinds.includes(k));
    if (varios && delGrupo.length < grupo.kinds.length) notas.push(`Solo: ${delGrupo.map((k) => ETIQUETA_CIERRE_CORTA[k].toLowerCase()).join(', ')}`);
    const otros = m.kinds.filter((k) => !grupo.kinds.includes(k));
    if (otros.length > 0) {
      notas.push(
        m.kinds.length === Object.keys(ETIQUETA_CIERRE).length
          ? 'En todos los niveles'
          : `También en ${[...new Set(otros.map((k) => (GRUPOS_MOTIVOS.find((x) => x.kinds.includes(k))?.corto ?? ETIQUETA_CIERRE[k]).toLowerCase()))].join('; ')}`,
      );
    }
    return notas.join(' · ');
  };

  return (
    <section className="cfg-mot-col" aria-label={grupo.corto}>
      <header className="cfg-mot-cab" title={grupo.ejemplos}>
        <h3><Icono size={17} aria-hidden />{grupo.corto}</h3>
        <p>{grupo.donde}</p>
      </header>

      {puedeEditar && (
        <div className="cfg-mot-nuevo">
          <div className="cfg-mot-nuevo-fila">
            <input
              type="text" value={nuevo} maxLength={80}
              placeholder="Escribe un motivo nuevo"
              aria-label={`Nuevo motivo: ${grupo.corto}`}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button className="auth-btn" onClick={agregar} style={{ padding: '8px 14px', fontSize: 13 }}>Agregar</button>
          </div>
          <details className="cfg-mot-opciones">
            <summary>Opciones del motivo nuevo</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
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
          </details>
        </div>
      )}

      {motivos.length === 0 ? (
        <p className="cfg-mot-vacio">Aún no hay motivos para esto.</p>
      ) : (
        <ul className="cfg-mot-lista">
          {motivos.map((m) => {
            const enEdicion = editId === m.id;
            const notas = notasDe(m);
            return (
              <li key={m.id} className={`cfg-mot-item${m.isActive ? '' : ' cfg-mot-item--off'}${enEdicion ? ' cfg-mot-item--edit' : ''}`}>
                {enEdicion ? (
                  <>
                    <input value={editLabel} maxLength={80} onChange={(e) => setEditLabel(e.target.value)}
                      aria-label="Nombre del motivo" style={{ ...inputStyle, width: '100%', padding: '6px 8px' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, color: '#718096' }}>Se usa en:</span>
                      {GRUPOS_MOTIVOS.map((gr) => (
                        <div key={gr.clave}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#4a5568' }}>{gr.corto}</div>
                          {gr.kinds.map((k) => (
                            <label key={k} style={checkStyle}>
                              <input type="checkbox" checked={editKinds.includes(k)} onChange={() => alternarEditKind(k)} />
                              {ETIQUETA_CIERRE[k]}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="cfg-serv-acciones" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn-secondary icon-btn" title="Guardar" aria-label="Guardar" onClick={onGuardarEdicion}><Check size={15} /></button>
                      <button className="btn-secondary icon-btn" title="Cancelar" aria-label="Cancelar" onClick={onCancelarEdicion}><XIcon size={15} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cfg-serv-texto">
                      <span className="cfg-serv-nombre">
                        {m.label}
                        {m.isSystem && <Lock size={11} style={{ marginLeft: 6, color: '#999' }} aria-label="Lo usa el sistema" />}
                      </span>
                      {notas && <span className="cfg-serv-sub">{notas}</span>}
                    </div>
                    <label className="cfg-switch" title={m.isActive ? 'Se ofrece. Clic para dejar de ofrecerlo.' : 'No se ofrece. Clic para ofrecerlo.'}>
                      <input
                        type="checkbox" role="switch" checked={m.isActive} disabled={m.isSystem || !puedeEditar}
                        aria-label={`Ofrecer el motivo ${m.label}`}
                        onChange={(e) => onActivar(m, e.target.checked)}
                      />
                      <span aria-hidden />
                    </label>
                    {puedeEditar && (
                      <div className="cfg-serv-acciones">
                        {m.isSystem ? (
                          <span className="icon-btn" aria-hidden="true" style={{ width: 64 }} />
                        ) : (
                          <>
                            <button className="btn-secondary icon-btn" title="Editar" aria-label={`Editar ${m.label}`} onClick={() => onEditar(m)}>
                              <Pencil size={14} />
                            </button>
                            <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label={`Eliminar ${m.label}`} onClick={() => onBorrar(m)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
