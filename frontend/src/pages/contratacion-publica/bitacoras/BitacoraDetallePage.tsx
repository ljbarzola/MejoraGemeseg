import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, CheckCircle2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  actualizarHallazgoBitacora,
  eliminarBitacora,
  getArchivoBitacora,
  getBitacora,
  guardarLecturaBitacora,
  releerBitacora,
} from '../../../services/bitacoras.service';
import type {
  BitacoraDetalle,
  CategoriaNovedad,
  EstadoHallazgo,
  HallazgoBitacora,
} from '../../../types/bitacoras';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import DateInput from '../../../components/common/DateInput';
import FilePreview from '../../../components/common/FilePreview';
import PromptDialog from '../../../components/common/PromptDialog';
import { usePerm } from '../../../contexts/PermissionsContext';
import { formatFechaHoraSync } from '../../../utils/formatFechaHora';
import {
  RESULTADO_AYUDA,
  RESULTADO_COLOR,
  RESULTADO_LABEL,
  SEVERIDAD_COLOR,
  SEVERIDAD_LABEL,
  TIPO_HALLAZGO_LABEL,
  fechaConDia,
  fechaLarga,
  periodoBitacora,
  textoOrigen,
} from '../../../utils/bitacoras';
import { mensajeError } from '../../../utils/entregasCp';

interface FilaRegistro {
  fecha: string;
  guardia: string;
  horaEntrada: string;
  horaSalida: string;
  legible: boolean;
  /** Con quién se emparejó la última vez que se guardó (solo lectura). */
  tomadoComo: string | null;
  coincidencia: number | null;
  guardado: boolean;
}

interface FilaNovedad {
  fecha: string;
  hora: string;
  categoria: CategoriaNovedad;
  texto: string;
}

const inputCelda: React.CSSProperties = {
  padding: '6px 8px',
  border: '2px solid var(--borde-input)',
  borderRadius: 8,
  width: '100%',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

const ESTADO_HALLAZGO_LABEL: Record<EstadoHallazgo, string> = {
  ABIERTO: 'Abierto',
  RESUELTO: 'Resuelto',
  DESCARTADO: 'Descartado',
};

export default function BitacoraDetallePage() {
  const { id } = useParams();
  const bitacoraId = Number(id);
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('CONTRATACION_PUBLICA');

  const [det, setDet] = useState<BitacoraDetalle | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState<'guardar' | 'releer' | null>(null);

  const [puestoLeido, setPuestoLeido] = useState('');
  const [fechasExtra, setFechasExtra] = useState<string[]>([]);
  const [registros, setRegistros] = useState<FilaRegistro[]>([]);
  const [novedades, setNovedades] = useState<FilaNovedad[]>([]);
  const [sucio, setSucio] = useState(false);
  const [fechaNueva, setFechaNueva] = useState('');

  const [accionHallazgo, setAccionHallazgo] = useState<{ h: HallazgoBitacora; estado: 'RESUELTO' | 'DESCARTADO' } | null>(null);
  const [confirmando, setConfirmando] = useState<'releer' | 'borrar' | null>(null);

  const aplicar = useCallback((d: BitacoraDetalle) => {
    setDet(d);
    setPuestoLeido(d.puestoLeido ?? '');
    setFechasExtra(d.fechas);
    setRegistros(
      d.registros.map((r) => ({
        fecha: r.fecha.slice(0, 10),
        guardia: r.guardiaLeido,
        horaEntrada: r.horaEntrada ?? '',
        horaSalida: r.horaSalida ?? '',
        legible: r.legible,
        tomadoComo: r.guardiaNombre,
        coincidencia: r.coincidencia,
        guardado: true,
      })),
    );
    setNovedades(
      d.novedades.map((n) => ({
        fecha: n.fecha.slice(0, 10),
        hora: n.hora ?? '',
        categoria: n.categoria,
        texto: n.texto,
      })),
    );
    setSucio(false);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(bitacoraId)) return;
    getBitacora(bitacoraId)
      .then(aplicar)
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar la bitácora.')));
  }, [bitacoraId, aplicar]);

  const fechaPorDefecto = det?.fechas[0] ?? new Date().toISOString().slice(0, 10);
  const fechasActuales = useMemo(
    () => [...new Set([...fechasExtra, ...registros.map((r) => r.fecha), ...novedades.map((n) => n.fecha)].filter(Boolean))].sort(),
    [fechasExtra, registros, novedades],
  );

  const marcar = () => { setSucio(true); setAviso(''); };

  const guardar = async () => {
    if (!det) return;
    const sinFecha = registros.find((r) => r.guardia.trim() && !r.fecha) ?? novedades.find((n) => n.texto.trim() && !n.fecha);
    if (sinFecha) {
      setError('Hay una línea sin fecha. Elige el día de cada línea antes de guardar.');
      return;
    }
    setOcupado('guardar');
    setError('');
    try {
      const d = await guardarLecturaBitacora(det.id, {
        puestoLeido: puestoLeido.trim() || null,
        fechas: fechasActuales,
        registros: registros
          .filter((r) => r.guardia.trim())
          .map((r) => ({ fecha: r.fecha, guardia: r.guardia, horaEntrada: r.horaEntrada || null, horaSalida: r.horaSalida || null, legible: r.legible })),
        novedades: novedades
          .filter((n) => n.texto.trim())
          .map((n) => ({ fecha: n.fecha || null, hora: n.hora || null, texto: n.texto, categoria: n.categoria })),
      });
      aplicar(d);
      setAviso('Guardado. La comparación con el horario se hizo de nuevo.');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la lectura.'));
    } finally {
      setOcupado(null);
    }
  };

  const releer = async () => {
    if (!det) return;
    setConfirmando(null);
    setOcupado('releer');
    setError('');
    try {
      aplicar(await releerBitacora(det.id));
      setAviso('El agente volvió a leer la foto.');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo volver a leer la bitácora.'));
    } finally {
      setOcupado(null);
    }
  };

  const borrar = async () => {
    if (!det) return;
    setConfirmando(null);
    try {
      await eliminarBitacora(det.id);
      navigate('/contratacion-publica/bitacoras?vista=lista', { replace: true });
    } catch (err) {
      setError(mensajeError(err, 'No se pudo eliminar la bitácora.'));
    }
  };

  const decidirHallazgo = async (nota: string) => {
    if (!accionHallazgo) return;
    const { h, estado } = accionHallazgo;
    setAccionHallazgo(null);
    try {
      aplicar(await actualizarHallazgoBitacora(h.id, estado, nota));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo actualizar el hallazgo.'));
    }
  };

  const reabrirHallazgo = async (h: HallazgoBitacora) => {
    try {
      aplicar(await actualizarHallazgoBitacora(h.id, 'ABIERTO'));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo reabrir el hallazgo.'));
    }
  };

  if (!det) {
    return (
      <div className="page-container">
        {error ? <div className="form-error">{error}</div> : <div className="loading-state">Cargando bitácora…</div>}
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/bitacoras?vista=lista')}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
      </div>
    );
  }

  const color = RESULTADO_COLOR[det.resultado];
  const abiertos = det.hallazgos.filter((h) => h.estado === 'ABIERTO');
  const tieneArchivo = !!det.archivoKey;
  const bloquear = !puedeEscribir || ocupado !== null;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/bitacoras?vista=lista')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">{det.entidadNombre.toUpperCase()} · CONTRATO {det.contratoNumero.toUpperCase()}</p>
            <h1>Bitácora n.º {det.id} · {det.puestoNombre}</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#718096' }}>
              {periodoBitacora(det.fechaDesde, det.fechaHasta)} · subida por {det.subidoPorNombre} el {formatFechaHoraSync(det.createdAt)} · {textoOrigen(det.origenLectura, det.estadoLectura)}
            </p>
          </div>
          <div className="header-actions">
            {tieneArchivo && (
              <button className="btn-secondary" disabled={bloquear} onClick={() => setConfirmando('releer')} title="El agente vuelve a leer la foto. Reemplaza lo leído y lo que corrigiste.">
                <RefreshCw size={16} className={ocupado === 'releer' ? 'spin' : undefined} /> {ocupado === 'releer' ? 'Leyendo…' : 'Volver a leer con el agente'}
              </button>
            )}
            {puedeEscribir && (
              <button className="btn-secondary btn-icon-toolbar" style={{ color: '#c53030' }} disabled={ocupado !== null} onClick={() => setConfirmando('borrar')} title="Eliminar la bitácora" aria-label="Eliminar la bitácora">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="form-error" style={{ margin: '12px 0' }}>{error}</div>}
      {aviso && <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 10, padding: '10px 14px', margin: '12px 0', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={16} /> {aviso}</div>}

      <div style={{ background: color.bg, color: color.fg, borderRadius: 12, padding: '12px 16px', margin: '12px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.05rem' }}>{RESULTADO_LABEL[det.resultado]}</strong>
        <span style={{ fontSize: '0.88rem' }}>{RESULTADO_AYUDA[det.resultado]}</span>
        {abiertos.length > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.88rem' }}>{abiertos.length} hallazgo(s) abierto(s)</span>}
      </div>

      {det.mensajeLectura && (
        <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', color: '#7b341e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem', display: 'flex', gap: 10 }}>
          <Bot size={18} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{det.mensajeLectura}</span>
        </div>
      )}
      {det.observaciones && (
        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', color: '#2a4365', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem' }}>
          <strong>Lo que el agente no pudo leer o dudó:</strong> {det.observaciones}
        </div>
      )}
      {!tieneArchivo && (
        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', color: '#2a4365', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem' }}>
          Esta bitácora se cargó sin foto: lo que dice la hoja se escribió a mano.
        </div>
      )}
      {!det.puestoExiste && (
        <div className="form-error">El puesto de esta bitácora ya no existe, así que no se puede comparar con un horario.</div>
      )}
      {!puedeEscribir && (
        <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', color: '#7b341e', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem' }}>
          Tu usuario solo puede ver esta bitácora. Para corregir lo leído o resolver hallazgos hace falta permiso de escribir en Contratación Pública.
        </div>
      )}

      <div className={`bitacora-layout${tieneArchivo ? '' : ' bitacora-layout--una'}`}>
        {/* ---------------------------------------------------------------- foto */}
        {tieneArchivo && (
        <div className="admin-section" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>La hoja</h3>
          <div style={{ height: 'min(70vh, 640px)', display: 'flex', flexDirection: 'column' }}>
            <FilePreview
              clave={det.id}
              cargar={() => getArchivoBitacora(det.id)}
              cargarOriginal={() => getArchivoBitacora(det.id)}
              nombreArchivo={det.archivoNombre ?? `bitacora-${det.id}`}
            />
          </div>
        </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {/* ------------------------------------------------------------ hallazgos */}
          <div className="admin-section">
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>Qué encontró la revisión</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#718096' }}>
              El sistema compara lo que dice la hoja con el horario del puesto. Resuelve o descarta cada hallazgo dejando una nota: queda en el historial.
            </p>
            {det.hallazgos.length === 0 ? (
              <p style={{ margin: 0, color: '#276749', fontWeight: 600, fontSize: '0.9rem' }}>
                {det.resultado === 'CONFORME' ? 'Todo cuadra: quienes aparecen son quienes debían estar, en su horario.' : 'No hay hallazgos.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {det.hallazgos.map((h) => (
                  <div key={h.id} style={{ border: '1px solid #dfe3ea', borderLeft: `4px solid ${SEVERIDAD_COLOR[h.severidad].fg}`, borderRadius: 10, padding: '10px 12px', background: h.estado === 'ABIERTO' ? 'white' : '#f7fafc', opacity: h.estado === 'ABIERTO' ? 1 : 0.8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="status-badge" style={{ background: SEVERIDAD_COLOR[h.severidad].bg, color: SEVERIDAD_COLOR[h.severidad].fg }}>{SEVERIDAD_LABEL[h.severidad]}</span>
                      <strong style={{ fontSize: '0.88rem' }}>{TIPO_HALLAZGO_LABEL[h.tipo] ?? h.tipo}</strong>
                      {h.estado !== 'ABIERTO' && <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>{ESTADO_HALLAZGO_LABEL[h.estado]}</span>}
                    </div>
                    <div style={{ fontSize: '0.88rem' }}>{h.mensaje}</div>
                    {h.estado !== 'ABIERTO' && h.nota && (
                      <div style={{ fontSize: '0.8rem', color: '#4a5568', marginTop: 6 }}>
                        «{h.nota}» — {h.resueltoPorNombre ?? 'alguien'}{h.resueltoAt ? `, ${formatFechaHoraSync(h.resueltoAt)}` : ''}
                      </div>
                    )}
                    {puedeEscribir && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {h.estado === 'ABIERTO' ? (
                          <>
                            <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setAccionHallazgo({ h, estado: 'RESUELTO' })}>Resolver</button>
                            <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setAccionHallazgo({ h, estado: 'DESCARTADO' })}>Descartar</button>
                          </>
                        ) : (
                          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => void reabrirHallazgo(h)}>Reabrir</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ lo que dice la hoja */}
          <div className="admin-section">
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>Lo que dice la hoja</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#718096' }}>
              {tieneArchivo
                ? 'Compáralo con la foto. Si el agente leyó mal algo, corrígelo y guarda: la comparación con el horario se hace de nuevo.'
                : 'Escribe lo que dice la hoja y guarda: se compara con el horario.'}
            </p>

            <div className="form-group">
              <label>Puesto que dice la hoja (opcional)</label>
              <input type="text" value={puestoLeido} disabled={bloquear} onChange={(e) => { setPuestoLeido(e.target.value); marcar(); }} placeholder="Como está escrito en el encabezado" />
            </div>

            <div className="form-group">
              <label>Días que cubre la hoja</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {fechasActuales.length === 0 && <span style={{ color: '#718096', fontSize: '0.85rem' }}>Todavía no hay días.</span>}
                {fechasActuales.map((f) => {
                  const enUso = registros.some((r) => r.fecha === f) || novedades.some((n) => n.fecha === f);
                  return (
                    <span key={f} className="status-badge" style={{ background: '#e2e8f0', color: '#2d3748', textTransform: 'none', letterSpacing: 0 }}>
                      {fechaLarga(f)}
                      {puedeEscribir && !enUso && (
                        <button type="button" aria-label={`Quitar ${fechaLarga(f)}`} onClick={() => { setFechasExtra((fs) => fs.filter((x) => x !== f)); marcar(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0 }}><X size={12} /></button>
                      )}
                    </span>
                  );
                })}
              </div>
              {puedeEscribir && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <div style={{ width: 170 }}><DateInput value={fechaNueva} onChange={setFechaNueva} placeholder="Agregar un día" /></div>
                  <button type="button" className="btn-secondary" disabled={!fechaNueva || bloquear} onClick={() => { setFechasExtra((fs) => [...new Set([...fs, fechaNueva])]); setFechaNueva(''); marcar(); }}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
              )}
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: '0.92rem' }}>Guardias</h4>
            {registros.length === 0 && (
              <p style={{ margin: '0 0 6px', color: '#718096', fontSize: '0.85rem' }}>No hay guardias leídos todavía.</p>
            )}
            {registros.length > 0 && (
              <div className="bitacora-fila bitacora-fila--guardia bitacora-fila--cabecera" aria-hidden="true">
                <span>Día</span><span>Guardia (como está escrito)</span><span>Entrada</span><span>Salida</span><span />
              </div>
            )}
            {registros.map((r, i) => (
              <div key={i} className="bitacora-fila-caja">
                <div className="bitacora-fila bitacora-fila--guardia">
                  <DateInput value={r.fecha} onChange={(v) => { setRegistros((rs) => rs.map((x, j) => (j === i ? { ...x, fecha: v } : x))); marcar(); }} placeholder="Día" />
                  <input style={inputCelda} aria-label="Guardia" value={r.guardia} disabled={bloquear} onChange={(e) => { setRegistros((rs) => rs.map((x, j) => (j === i ? { ...x, guardia: e.target.value, legible: true } : x))); marcar(); }} />
                  <input type="time" style={inputCelda} aria-label="Entrada" value={r.horaEntrada} disabled={bloquear} onChange={(e) => { setRegistros((rs) => rs.map((x, j) => (j === i ? { ...x, horaEntrada: e.target.value } : x))); marcar(); }} />
                  <input type="time" style={inputCelda} aria-label="Salida" value={r.horaSalida} disabled={bloquear} onChange={(e) => { setRegistros((rs) => rs.map((x, j) => (j === i ? { ...x, horaSalida: e.target.value } : x))); marcar(); }} />
                  {puedeEscribir ? (
                    <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} aria-label="Quitar la línea" title="Quitar la línea" disabled={bloquear} onClick={() => { setRegistros((rs) => rs.filter((_, j) => j !== i)); marcar(); }}><Trash2 size={15} /></button>
                  ) : <span />}
                </div>
                <div className="bitacora-fila-nota">
                  {!r.guardado ? <span>Con quién se emparejó se calcula al guardar.</span>
                    : r.tomadoComo ? <span title={r.coincidencia !== null ? `Coincidencia ${Math.round(r.coincidencia * 100)}%` : undefined}>Se tomó como: <strong>{r.tomadoComo}</strong></span>
                    : <span style={{ color: '#c53030', fontWeight: 600 }}>No es ninguno de los guardias del puesto.</span>}
                  {!r.legible && <span style={{ color: '#c05621' }}> · El agente la leyó con dudas.</span>}
                </div>
              </div>
            ))}
            {puedeEscribir && (
              <button type="button" className="btn-secondary" style={{ marginTop: 8 }} disabled={bloquear} onClick={() => { setRegistros((rs) => [...rs, { fecha: fechaPorDefecto, guardia: '', horaEntrada: '', horaSalida: '', legible: true, tomadoComo: null, coincidencia: null, guardado: false }]); marcar(); }}>
                <Plus size={14} /> Agregar guardia
              </button>
            )}

            <h4 style={{ margin: '18px 0 6px', fontSize: '0.92rem' }}>Novedades</h4>
            {novedades.length === 0 && (
              <p style={{ margin: '0 0 6px', color: '#718096', fontSize: '0.85rem' }}>No hay novedades registradas.</p>
            )}
            {novedades.map((n, i) => (
              <div key={i} className="bitacora-fila-caja">
                <div className="bitacora-fila bitacora-fila--novedad">
                  <DateInput value={n.fecha} onChange={(v) => { setNovedades((ns) => ns.map((x, j) => (j === i ? { ...x, fecha: v } : x))); marcar(); }} placeholder="Día" />
                  <input type="time" style={inputCelda} aria-label="Hora" value={n.hora} disabled={bloquear} onChange={(e) => { setNovedades((ns) => ns.map((x, j) => (j === i ? { ...x, hora: e.target.value } : x))); marcar(); }} />
                  <select style={inputCelda} aria-label="Tipo de novedad" value={n.categoria} disabled={bloquear} onChange={(e) => { setNovedades((ns) => ns.map((x, j) => (j === i ? { ...x, categoria: e.target.value as CategoriaNovedad } : x))); marcar(); }}>
                    {det.categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
                  </select>
                  {puedeEscribir ? (
                    <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} aria-label="Quitar la novedad" title="Quitar la novedad" disabled={bloquear} onClick={() => { setNovedades((ns) => ns.filter((_, j) => j !== i)); marcar(); }}><Trash2 size={15} /></button>
                  ) : <span />}
                </div>
                <textarea style={{ ...inputCelda, minHeight: 54, resize: 'vertical', marginTop: 8 }} aria-label="Qué se anotó" placeholder="Qué se anotó" value={n.texto} disabled={bloquear} onChange={(e) => { setNovedades((ns) => ns.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x))); marcar(); }} />
              </div>
            ))}
            {puedeEscribir && (
              <button type="button" className="btn-secondary" style={{ marginTop: 8 }} disabled={bloquear} onClick={() => { setNovedades((ns) => [...ns, { fecha: fechaPorDefecto, hora: '', categoria: 'OTRO', texto: '' }]); marcar(); }}>
                <Plus size={14} /> Agregar novedad
              </button>
            )}

            {puedeEscribir && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
                {sucio && <span style={{ fontSize: '0.82rem', color: '#c05621' }}>Hay cambios sin guardar.</span>}
                <button type="button" className="auth-btn" disabled={!sucio || ocupado !== null} onClick={() => void guardar()}>
                  <Save size={16} /> {ocupado === 'guardar' ? 'Guardando…' : 'Guardar y revisar de nuevo'}
                </button>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ comparación por día */}
          <div className="admin-section">
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>Lo que decía el horario</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#718096' }}>
              Quién le tocaba a cada guardia cada día de la hoja, y si aparece en ella. Se calcula con el horario vigente de ese puesto.
            </p>
            {det.fechas.length === 0 ? (
              <p style={{ margin: 0, color: '#718096', fontSize: '0.88rem' }}>Cuando la hoja tenga días, aquí se verá la comparación.</p>
            ) : (
              det.fechas.map((f) => <ComparacionDia key={f} fecha={f} det={det} />)
            )}
          </div>
        </div>
      </div>

      {accionHallazgo && (
        <PromptDialog
          title={accionHallazgo.estado === 'RESUELTO' ? 'Resolver hallazgo' : 'Descartar hallazgo'}
          message={
            accionHallazgo.estado === 'RESUELTO'
              ? 'Cuenta qué se hizo o qué pasó (por ejemplo: «Juan cambió el turno con Pedro, ya está autorizado»).'
              : 'Explica por qué se descarta (por ejemplo: «El agente leyó mal el nombre; en la foto dice Juan»).'
          }
          placeholder="Nota"
          required
          confirmLabel={accionHallazgo.estado === 'RESUELTO' ? 'Resolver' : 'Descartar'}
          onConfirm={(nota) => void decidirHallazgo(nota)}
          onCancel={() => setAccionHallazgo(null)}
        />
      )}
      {confirmando === 'releer' && (
        <ConfirmDialog
          title="Volver a leer la foto"
          confirmLabel="Volver a leer"
          message={sucio || det.origenLectura === 'IA_CORREGIDA' ? 'El agente leerá la foto otra vez y se reemplazará todo lo que está escrito abajo, incluidas tus correcciones. ¿Continuar?' : 'El agente leerá la foto otra vez y se reemplazará lo leído. ¿Continuar?'}
          onConfirm={() => void releer()}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {confirmando === 'borrar' && (
        <ConfirmDialog
          title="Eliminar bitácora"
          danger
          confirmLabel="Eliminar"
          message={`Se elimina la bitácora n.º ${det.id} de «${det.puestoNombre}» con su foto, lo leído y sus hallazgos. No se puede deshacer.`}
          onConfirm={() => void borrar()}
          onCancel={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}

/** Un día: lo esperado según el horario frente a lo que aparece en la hoja. */
function ComparacionDia({ fecha, det }: { fecha: string; det: BitacoraDetalle }) {
  const esperado = det.esperadoPorFecha[fecha] ?? [];
  const estado = det.horarioPorFecha[fecha];
  const delDia = det.registros.filter((r) => r.fecha.slice(0, 10) === fecha);
  const cedulasEsperadas = new Set(esperado.map((e) => e.cedula));
  const ajenos = delDia.filter((r) => !r.cedula || !cedulasEsperadas.has(r.cedula));

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <strong style={{ fontSize: '0.9rem' }}>{fechaConDia(fecha)}</strong>
        <span className="status-badge" style={{ background: estado ? '#e2e8f0' : '#feebc8', color: estado ? '#4a5568' : '#c05621' }}>
          {estado ? `Horario ${estado.toLowerCase()}` : 'Sin horario'}
        </span>
      </div>
      {!estado ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#718096' }}>No hay un horario cargado que cubra este día.</p>
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead>
              <tr><th>Guardia</th><th>Le tocaba</th><th>En la hoja</th></tr>
            </thead>
            <tbody>
              {esperado.map((e) => {
                const l = delDia.find((r) => r.cedula === e.cedula);
                const turno = e.descanso ? `${e.codigoNombre ?? 'Libre'} (${e.codigo})` : `${e.codigoNombre ?? 'Turno'} (${e.codigo})${e.horaInicio && e.horaFin ? ` · ${e.horaInicio}–${e.horaFin}` : ''}`;
                let texto: React.ReactNode;
                if (l) {
                  const horas = l.horaEntrada || l.horaSalida ? ` · ${l.horaEntrada ?? '?'}–${l.horaSalida ?? '?'}` : '';
                  texto = e.descanso
                    ? <span style={{ color: '#c53030', fontWeight: 600 }}>Aparece, pero estaba libre{horas}</span>
                    : <span style={{ color: '#276749', fontWeight: 600 }}>Aparece{horas}</span>;
                } else {
                  texto = e.descanso ? <span style={{ color: '#718096' }}>No aparece (libre)</span> : <span style={{ color: '#c53030', fontWeight: 600 }}>No aparece</span>;
                }
                return (
                  <tr key={e.cedula}>
                    <td><span className="truncate" title={e.nombre}>{e.nombre}</span></td>
                    <td>{turno}</td>
                    <td>{texto}</td>
                  </tr>
                );
              })}
              {ajenos.map((r, i) => (
                <tr key={`a${i}`}>
                  <td>{r.guardiaLeido}</td>
                  <td style={{ color: '#718096' }}>{r.guardiaNombre ? 'Sin turno ese día' : 'No es del puesto'}</td>
                  <td><span style={{ color: '#c53030', fontWeight: 600 }}>Aparece{r.horaEntrada || r.horaSalida ? ` · ${r.horaEntrada ?? '?'}–${r.horaSalida ?? '?'}` : ''}</span></td>
                </tr>
              ))}
              {esperado.length === 0 && ajenos.length === 0 && (
                <tr><td colSpan={3} style={{ color: '#718096', textAlign: 'center' }}>El horario no tiene guardias cargados ese día.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
