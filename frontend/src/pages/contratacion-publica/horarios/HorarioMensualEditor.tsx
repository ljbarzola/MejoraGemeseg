import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Send, CheckCircle2, XCircle, RotateCcw, Repeat, Wand2 } from 'lucide-react';
import {
  getHorario,
  getPuestosByContrato,
  getCodigosTurno,
  upsertCeldaHorario,
  reemplazarCeldasPuestoHorario,
  intercambiarTurnoHorario,
  cambiarEstadoHorario,
  getHorarioPdfBlob,
  getHorarioExcelBlob,
} from '../../../services/contratacion-publica.service';
import type {
  CPHorarioMensual,
  CPPuestoServicio,
  CPCodigoTurno,
} from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import GeneradorPatronModal from './GeneradorPatronModal';

// Inicial del día de la semana en español, lunes primero (fila de encabezado).
const DIA_INICIAL = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  BORRADOR: { bg: '#fefcbf', fg: '#975a16' },
  ENVIADO: { bg: '#bee3f8', fg: '#2b6cb0' },
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
};

const TRANSICIONES: Record<string, string[]> = {
  BORRADOR: ['ENVIADO'],
  ENVIADO: ['APROBADO', 'RECHAZADO'],
  RECHAZADO: ['BORRADOR'],
  APROBADO: [],
};

function formatFechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

function diaSemanaInicial(fecha: string) {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay(); // 0=domingo
  return DIA_INICIAL[(dow + 6) % 7];
}

/** Lista de fechas 'YYYY-MM-DD' entre fechaInicio y fechaFin del horario (rango real, no mes calendario). */
function listaFechas(fechaInicio: string, fechaFin: string): string[] {
  const [ai, mi, di] = fechaInicio.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const [af, mf, df] = fechaFin.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const inicio = Date.UTC(ai, mi - 1, di);
  const fin = Date.UTC(af, mf - 1, df);
  const out: string[] = [];
  for (let ts = inicio; ts <= fin; ts += 86400000) {
    const d = new Date(ts);
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return out;
}

interface FilaGuardia {
  puestoId: number;
  puestoNombre: string;
  cedula: string;
  nombreGuardia: string;
}

export default function HorarioMensualEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const horarioId = Number(id);

  const [horario, setHorario] = useState<CPHorarioMensual | null>(null);
  const [puestos, setPuestos] = useState<CPPuestoServicio[]>([]);
  const [codigos, setCodigos] = useState<CPCodigoTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  // matriz[`${puestoId}|${cedula}|${fecha}`] = código de turno
  const [matriz, setMatriz] = useState<Record<string, string>>({});
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [showRechazarForm, setShowRechazarForm] = useState(false);
  const [confirmandoEstado, setConfirmandoEstado] = useState<string | null>(null);

  const [showIntercambio, setShowIntercambio] = useState(false);
  const [intercambioPuestoId, setIntercambioPuestoId] = useState('');
  const [intercambioFecha, setIntercambioFecha] = useState('');
  const [intercambioA, setIntercambioA] = useState('');
  const [intercambioB, setIntercambioB] = useState('');
  const [intercambiando, setIntercambiando] = useState(false);

  const [patronPuestoId, setPatronPuestoId] = useState<number | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const load = () => {
    setLoading(true);
    setError('');
    getHorario(horarioId)
      .then(async (h) => {
        setHorario(h);
        const [p, c] = await Promise.all([getPuestosByContrato(h.contratoId), getCodigosTurno()]);
        setPuestos(p);
        setCodigos(c);
        const mat: Record<string, string> = {};
        (h.celdas || []).forEach((celda) => {
          const fecha = celda.fecha.slice(0, 10);
          mat[`${celda.puestoId}|${celda.cedula}|${fecha}`] = celda.codigoTurno;
        });
        setMatriz(mat);
      })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el horario.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [horarioId]);

  const editable = horario?.estado === 'BORRADOR';
  const fechas = useMemo(
    () => (horario ? listaFechas(horario.fechaInicio, horario.fechaFin) : []),
    [horario],
  );
  const codigosActivos = codigos.filter((c) => c.activo);
  const codigoPorCodigo = useMemo(() => {
    const map = new Map<string, CPCodigoTurno>();
    codigos.forEach((c) => map.set(c.codigo, c));
    return map;
  }, [codigos]);

  const filas: FilaGuardia[] = useMemo(() => {
    const out: FilaGuardia[] = [];
    puestos.forEach((p) => {
      (p.guardias || []).forEach((g) => {
        out.push({ puestoId: p.id, puestoNombre: p.nombre, cedula: g.cedula, nombreGuardia: g.nombreGuardia });
      });
    });
    return out;
  }, [puestos]);

  const filasPorPuesto = useMemo(() => {
    const map = new Map<number, FilaGuardia[]>();
    filas.forEach((f) => {
      const arr = map.get(f.puestoId) || [];
      arr.push(f);
      map.set(f.puestoId, arr);
    });
    return map;
  }, [filas]);

  const handleCambiarCelda = async (fila: FilaGuardia, fecha: string, nuevoCodigo: string) => {
    if (!horario || !editable) return;
    const key = `${fila.puestoId}|${fila.cedula}|${fecha}`;
    setError('');
    if (nuevoCodigo) {
      // ruta rápida: upsert de una sola celda
      setMatriz((m) => ({ ...m, [key]: nuevoCodigo }));
      try {
        await upsertCeldaHorario(horario.id, {
          puestoId: fila.puestoId,
          cedula: fila.cedula,
          nombreGuardia: fila.nombreGuardia,
          fecha,
          codigoTurno: nuevoCodigo,
        });
      } catch (err: any) {
        setError(err.response?.data?.message || 'No se pudo guardar la celda.');
        load();
      }
      return;
    }

    // Limpiar celda: no hay endpoint de borrado puntual, se reemplaza el
    // lote completo del puesto sin esa celda (ver backend `reemplazarCeldasPuesto`).
    const filasDelPuesto = filasPorPuesto.get(fila.puestoId) || [];
    const celdasRestantes = filasDelPuesto
      .flatMap((f) =>
        fechas
          .filter((fe) => !(f.cedula === fila.cedula && fe === fecha))
          .map((fe) => ({ cedula: f.cedula, nombreGuardia: f.nombreGuardia, fecha: fe, codigo: matriz[`${f.puestoId}|${f.cedula}|${fe}`] })),
      )
      .filter((c) => c.codigo)
      .map((c) => ({ cedula: c.cedula, nombreGuardia: c.nombreGuardia, fecha: c.fecha, codigoTurno: c.codigo! }));

    setMatriz((m) => { const next = { ...m }; delete next[key]; return next; });
    try {
      await reemplazarCeldasPuestoHorario(horario.id, { puestoId: fila.puestoId, celdas: celdasRestantes });
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo limpiar la celda.');
      load();
    }
  };

  const filasIntercambio = useMemo(
    () => filas.filter((f) => String(f.puestoId) === intercambioPuestoId),
    [filas, intercambioPuestoId],
  );

  const handleIntercambiar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!horario || !intercambioPuestoId || !intercambioFecha || !intercambioA || !intercambioB || intercambioA === intercambioB) {
      setError('Selecciona un puesto, una fecha y dos guardias distintos para intercambiar.');
      return;
    }
    setIntercambiando(true);
    setError('');
    try {
      await intercambiarTurnoHorario(horario.id, {
        puestoId: Number(intercambioPuestoId),
        fecha: intercambioFecha,
        cedulaA: intercambioA,
        cedulaB: intercambioB,
      });
      setShowIntercambio(false);
      setIntercambioPuestoId(''); setIntercambioFecha(''); setIntercambioA(''); setIntercambioB('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo intercambiar el turno.');
    } finally {
      setIntercambiando(false);
    }
  };

  const handleCambiarEstado = async () => {
    const nuevoEstado = confirmandoEstado;
    setConfirmandoEstado(null);
    if (!horario || !nuevoEstado) return;
    setCambiandoEstado(true);
    setError('');
    try {
      await cambiarEstadoHorario(horario.id, { estado: nuevoEstado, motivoRechazo: nuevoEstado === 'RECHAZADO' ? motivoRechazo : undefined });
      setShowRechazarForm(false);
      setMotivoRechazo('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo cambiar el estado del horario.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleExportarPdf = async () => {
    if (!horario) return;
    try {
      const blob = await getHorarioPdfBlob(horario.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo generar el PDF del horario.');
    }
  };

  const handleExportarExcel = async () => {
    if (!horario) return;
    try {
      const blob = await getHorarioExcelBlob(horario.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horario_${horario.fechaInicio.slice(0, 10)}_${horario.fechaFin.slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo generar el Excel del horario.');
    }
  };

  if (loading) return <div className="page-container"><div className="loading-state">Cargando horario...</div></div>;
  if (!horario) return <div className="page-container"><div className="empty-state">Horario no encontrado.</div></div>;

  const permitidas = TRANSICIONES[horario.estado] || [];
  const puestoPatron = patronPuestoId != null ? puestos.find((p) => p.id === patronPuestoId) : undefined;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/contratos/${horario.contratoId}`)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · HORARIO</p>
            <h1>{formatFechaCorta(horario.fechaInicio)} al {formatFechaCorta(horario.fechaFin)}</h1>
          </div>
          <div className="header-actions">
            <span className="status-badge" style={{ background: ESTADO_COLOR[horario.estado]?.bg, color: ESTADO_COLOR[horario.estado]?.fg }}>
              {horario.estado}
            </span>
            <button className="btn-secondary" onClick={handleExportarPdf}>
              <Download size={16} /> Exportar PDF
            </button>
            <button className="btn-secondary" onClick={handleExportarExcel}>
              <FileSpreadsheet size={16} /> Exportar Excel
            </button>
            {editable && (
              <button className="btn-secondary" onClick={() => setShowIntercambio((v) => !v)}>
                <Repeat size={16} /> Intercambiar turno
              </button>
            )}
            {permitidas.includes('ENVIADO') && (
              <button className="auth-btn" disabled={cambiandoEstado} onClick={() => setConfirmandoEstado('ENVIADO')}>
                <Send size={16} /> Enviar
              </button>
            )}
            {permitidas.includes('APROBADO') && (
              <button className="auth-btn" disabled={cambiandoEstado} onClick={() => setConfirmandoEstado('APROBADO')} style={{ background: '#276749', borderColor: '#276749' }}>
                <CheckCircle2 size={16} /> Aprobar
              </button>
            )}
            {permitidas.includes('RECHAZADO') && (
              <button className="btn-secondary" disabled={cambiandoEstado} onClick={() => setShowRechazarForm((v) => !v)} style={{ color: '#c53030' }}>
                <XCircle size={16} /> Rechazar
              </button>
            )}
            {permitidas.includes('BORRADOR') && (
              <button className="btn-secondary" disabled={cambiandoEstado} onClick={() => setConfirmandoEstado('BORRADOR')}>
                <RotateCcw size={16} /> Volver a Borrador
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div ref={errorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>{error}</div>
      )}

      {!editable && (
        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#2b6cb0' }}>
          Este horario está en estado <strong>{horario.estado}</strong> — la matriz es de solo lectura. Solo se puede editar en Borrador.
          {horario.estado === 'RECHAZADO' && horario.motivoRechazo && (
            <div style={{ marginTop: '6px' }}>Motivo de rechazo: {horario.motivoRechazo}</div>
          )}
        </div>
      )}

      {showRechazarForm && (
        <div className="admin-section" style={{ marginBottom: '16px' }}>
          <div className="form-group">
            <label>Motivo de rechazo (opcional)</label>
            <textarea value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowRechazarForm(false)}>Cancelar</button>
            <button className="auth-btn" style={{ background: '#c53030', borderColor: '#c53030' }} onClick={() => setConfirmandoEstado('RECHAZADO')}>Confirmar Rechazo</button>
          </div>
        </div>
      )}

      {showIntercambio && (
        <form onSubmit={handleIntercambiar} className="admin-section" style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Puesto</label>
            <select value={intercambioPuestoId} onChange={(e) => { setIntercambioPuestoId(e.target.value); setIntercambioA(''); setIntercambioB(''); }}>
              <option value="">-- Puesto --</option>
              {puestos.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Día</label>
            <select value={intercambioFecha} onChange={(e) => setIntercambioFecha(e.target.value)}>
              <option value="">-- Día --</option>
              {fechas.map((f) => (<option key={f} value={f}>{formatFechaCorta(f)}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Guardia A</label>
            <select value={intercambioA} onChange={(e) => setIntercambioA(e.target.value)} disabled={!intercambioPuestoId}>
              <option value="">-- Seleccionar --</option>
              {filasIntercambio.map((f) => (<option key={f.cedula} value={f.cedula}>{f.nombreGuardia}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Guardia B</label>
            <select value={intercambioB} onChange={(e) => setIntercambioB(e.target.value)} disabled={!intercambioPuestoId}>
              <option value="">-- Seleccionar --</option>
              {filasIntercambio.map((f) => (<option key={f.cedula} value={f.cedula}>{f.nombreGuardia}</option>))}
            </select>
          </div>
          <button type="submit" className="auth-btn" disabled={intercambiando}>{intercambiando ? 'Intercambiando...' : 'Intercambiar'}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowIntercambio(false)}>Cancelar</button>
        </form>
      )}

      <div className="admin-section" style={{ padding: 0, overflow: 'hidden' }}>
        {filas.length === 0 ? (
          <div className="empty-state">Este contrato no tiene guardias asignados a sus puestos todavía.</div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
            <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#f7fafc', border: '1px solid #e2e8f0', padding: '8px 10px', minWidth: '180px', textAlign: 'left' }}>
                    Guardia
                  </th>
                  {fechas.map((f) => (
                    <th key={f} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f7fafc', border: '1px solid #e2e8f0', padding: '6px 4px', minWidth: '40px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{diaSemanaInicial(f)}</div>
                      <div>{formatFechaCorta(f)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {puestos.map((p) => {
                  const filasPuesto = filasPorPuesto.get(p.id) || [];
                  if (filasPuesto.length === 0) return null;
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td
                          colSpan={fechas.length + 1}
                          style={{ position: 'sticky', left: 0, background: '#edf2f7', border: '1px solid #e2e8f0', padding: '6px 10px' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{p.nombre} · {p.tipoTurno}</span>
                            {editable && (
                              <button
                                className="btn-secondary"
                                style={{ fontSize: '0.72rem', padding: '3px 9px', whiteSpace: 'nowrap' }}
                                onClick={() => setPatronPuestoId(p.id)}
                              >
                                <Wand2 size={13} /> Generar patrón
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {filasPuesto.map((fila) => (
                        <tr key={`${fila.puestoId}-${fila.cedula}`}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fff', border: '1px solid #e2e8f0', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>{fila.nombreGuardia}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{fila.cedula}</div>
                          </td>
                          {fechas.map((f) => {
                            const key = `${fila.puestoId}|${fila.cedula}|${f}`;
                            const valor = matriz[key] || '';
                            const codigoInfo = valor ? codigoPorCodigo.get(valor) : undefined;
                            return (
                              <td key={f} style={{ border: '1px solid #e2e8f0', padding: 0, textAlign: 'center' }}>
                                {editable ? (
                                  <select
                                    value={valor}
                                    onChange={(e) => handleCambiarCelda(fila, f, e.target.value)}
                                    style={{
                                      width: '100%',
                                      border: 'none',
                                      padding: '6px 2px',
                                      textAlign: 'center',
                                      fontSize: '0.76rem',
                                      fontWeight: 700,
                                      background: codigoInfo?.color ? `${codigoInfo.color}33` : 'transparent',
                                      color: codigoInfo?.color || '#2d3748',
                                    }}
                                  >
                                    <option value="">·</option>
                                    {codigosActivos.map((c) => (
                                      <option key={c.codigo} value={c.codigo}>{c.codigo}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div style={{ padding: '6px 2px', fontWeight: 700, background: codigoInfo?.color ? `${codigoInfo.color}33` : 'transparent', color: codigoInfo?.color || '#2d3748' }}>
                                    {valor || '·'}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmandoEstado != null && (
        <ConfirmDialog
          title="Cambiar estado del horario"
          message={`¿Cambiar el estado de este horario a ${confirmandoEstado}?`}
          confirmLabel="Confirmar"
          onConfirm={handleCambiarEstado}
          onCancel={() => setConfirmandoEstado(null)}
        />
      )}

      {patronPuestoId != null && puestoPatron && (
        <GeneradorPatronModal
          puestoId={patronPuestoId}
          puestoNombre={puestoPatron.nombre}
          horarioId={horario.id}
          fechaInicio={horario.fechaInicio.slice(0, 10)}
          fechaFin={horario.fechaFin.slice(0, 10)}
          guardiasDelPuesto={(filasPorPuesto.get(patronPuestoId) || []).map((f) => ({ cedula: f.cedula, nombreGuardia: f.nombreGuardia }))}
          codigosTurno={codigos}
          celdasExistentesCount={(filasPorPuesto.get(patronPuestoId) || []).reduce(
            (acc, f) => acc + fechas.filter((fe) => matriz[`${f.puestoId}|${f.cedula}|${fe}`]).length,
            0,
          )}
          onClose={() => setPatronPuestoId(null)}
          onGenerated={() => { setPatronPuestoId(null); load(); }}
        />
      )}
    </div>
  );
}
