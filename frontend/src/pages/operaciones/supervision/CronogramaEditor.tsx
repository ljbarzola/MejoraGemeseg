import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Trash2 } from 'lucide-react';
import { usePerm } from '../../../contexts/PermissionsContext';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import {
  editarPuntoCronograma,
  eliminarCronograma,
  getCandidatosSupervisor,
  getCronograma,
  getCronogramaExcelBlob,
  reemplazarDiasPunto,
} from '../../../services/supervision.service';
import { JORNADAS_SUPERVISION, type CandidatoSupervisor, type Cronograma, type EstadoDiaSupervision, type ModoRelleno, type PuntoCronograma } from '../../../types/supervision';

const SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const diaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const fechaCorta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

const ESTILO: Record<string, { fondo: string; color: string; texto: string; titulo: string }> = {
  CUMPLIDA: { fondo: '#c6f6d5', color: '#276749', texto: '✓', titulo: 'Visita hecha' },
  SIN_VISITA: { fondo: '#fed7d7', color: '#c53030', texto: 'x', titulo: 'Planeada, ya pasó sin visita' },
  PENDIENTE: { fondo: '#ebf8ff', color: '#2b6cb0', texto: 'x', titulo: 'Planeada' },
  EXTRA: { fondo: '#bee3f8', color: '#2c5282', texto: '+', titulo: 'Visita en un día no planeado' },
};

function diasSegunModo(modo: ModoRelleno, dias: string[]): string[] {
  if (modo === 'NINGUNO') return [];
  if (modo === 'LUN_VIE') return dias.filter((f) => diaSemana(f) >= 1 && diaSemana(f) <= 5);
  if (modo === 'FIN_SEMANA') return dias.filter((f) => diaSemana(f) === 0 || diaSemana(f) === 6);
  return dias;
}

export default function CronogramaEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const cronogramaId = Number(id);
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('OPERACIONES');
  const errorRef = useRef<HTMLDivElement>(null);

  const [c, setC] = useState<Cronograma | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoSupervisor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [escribiendo, setEscribiendo] = useState<Record<number, string>>({});
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);

  useEffect(() => {
    setCargando(true);
    Promise.all([getCronograma(cronogramaId), getCandidatosSupervisor()])
      .then(([cr, cand]) => { setC(cr); setCandidatos(cand); })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el cronograma.'))
      .finally(() => setCargando(false));
  }, [cronogramaId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  /** Aplica un cambio al servidor y deja en pantalla el cronograma que devuelve. */
  const aplicar = async (cambio: () => Promise<Cronograma>) => {
    setOcupado(true);
    setError('');
    try {
      setC(await cambio());
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el cambio.');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarDia = (p: PuntoCronograma, fecha: string) => {
    if (!puedeEditar || ocupado) return;
    const set = new Set(p.planificados);
    if (set.has(fecha)) set.delete(fecha);
    else set.add(fecha);
    void aplicar(() => reemplazarDiasPunto(cronogramaId, p.id, [...set]));
  };

  const elegirSupervisor = (p: PuntoCronograma, valor: string) => {
    if (valor === 'otro') {
      setEscribiendo((e) => ({ ...e, [p.id]: p.supervisorUserId ? '' : p.supervisorNombre ?? '' }));
      return;
    }
    setEscribiendo((e) => { const n = { ...e }; delete n[p.id]; return n; });
    void aplicar(() => editarPuntoCronograma(cronogramaId, p.id, { supervisorUserId: valor ? Number(valor) : null, supervisorNombre: valor ? undefined : '' }));
  };

  const guardarNombre = (p: PuntoCronograma) => {
    const nombre = (escribiendo[p.id] ?? '').trim();
    if (!nombre || nombre === p.supervisorNombre) return;
    void aplicar(() => editarPuntoCronograma(cronogramaId, p.id, { supervisorUserId: null, supervisorNombre: nombre }));
  };

  const bajarExcel = async () => {
    if (!c) return;
    try {
      const blob = await getCronogramaExcelBlob(c.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cronograma_supervision_${c.contratoNumero}_${c.fechaInicio}_${c.fechaFin}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo generar el Excel del cronograma.');
    }
  };

  const borrar = async () => {
    setConfirmandoBorrar(false);
    try {
      await eliminarCronograma(cronogramaId);
      navigate('/operaciones/supervision?pestana=cronogramas');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el cronograma.');
    }
  };

  if (cargando) return <div className="page-container"><div className="loading-state">Cargando cronograma...</div></div>;
  if (!c) return <div className="page-container">{error ? <div ref={errorRef} className="form-error">{error}</div> : <div className="empty-state">Cronograma no encontrado.</div>}</div>;

  const cumplimiento = c.resumen.cumplimiento;
  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <button className="cacao-back-btn" onClick={() => navigate('/operaciones/supervision?pestana=cronogramas')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver a Supervisión
        </button>
        <OperacionesPageHeader
          title={`Cronograma del ${fechaCorta(c.fechaInicio)} al ${fechaCorta(c.fechaFin)}`}
          description={`Contrato ${c.contratoNumero} · ${c.entidadNombre}. Qué días se planea visitar cada punto y qué se cumplió.`}
          actions={
            <>
              <button className="btn-secondary" onClick={bajarExcel}><FileSpreadsheet size={16} /> Excel para firmar</button>
              {puedeEditar && (
                <button className="btn-secondary" style={{ color: '#c53030' }} onClick={() => setConfirmandoBorrar(true)}><Trash2 size={16} /> Eliminar</button>
              )}
            </>
          }
        />
      </div>

      {error && <div ref={errorRef} className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
      {!c.administradorNombre && (
        <div style={{ background: '#fefcbf', border: '1px solid #f6e05e', color: '#975a16', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.84rem' }}>
          Para la firma de «Aprobado por» falta el administrador del contrato: se completa con «Editar» en el detalle del contrato.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.85rem' }}>
        <span className="status-badge" style={{ background: '#ebf8ff', color: '#2b6cb0' }}>{c.resumen.planificadas} visitas planeadas</span>
        <span className="status-badge" style={{ background: '#c6f6d5', color: '#276749' }}>{c.resumen.cumplidas} cumplidas</span>
        <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>{c.resumen.sinVisita} sin visita</span>
        <span className="status-badge" style={{ background: '#edf2f7', color: '#4a5568' }}>{c.resumen.pendientes} por hacer</span>
        <span className="status-badge" style={{ background: '#bee3f8', color: '#2c5282' }}>{cumplimiento === null ? 'Cumplimiento: aún sin días pasados' : `Cumplimiento: ${cumplimiento}%`}</span>
      </div>

      <div className="admin-section">
        <div className="tasks-table-wrapper">
          <table className="tasks-table" data-fijas="1">
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>Punto de servicio</th>
                <th style={{ minWidth: 190 }}>Supervisor asignado</th>
                <th style={{ minWidth: 150 }}>Jornada</th>
                {puedeEditar && <th style={{ minWidth: 120 }}>Rellenar</th>}
                {c.dias.map((f) => (
                  <th key={f} style={{ padding: '4px 2px', textAlign: 'center', minWidth: 28, color: diaSemana(f) === 0 || diaSemana(f) === 6 ? '#c53030' : undefined, outline: f === c.hoy ? '2px solid #2b6cb0' : undefined }}>
                    <div style={{ fontSize: '0.65rem' }}>{SEMANA[diaSemana(f)]}</div>
                    <div style={{ fontSize: '0.75rem' }}>{Number(f.slice(8, 10))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.puntos.map((p) => {
                const otro = p.id in escribiendo || (!p.supervisorUserId && !!p.supervisorNombre);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.puestoNombre}</td>
                    <td>
                      {puedeEditar ? (
                        <>
                          <select
                            disabled={ocupado}
                            value={otro ? 'otro' : p.supervisorUserId ?? ''}
                            onChange={(e) => elegirSupervisor(p, e.target.value)}
                            style={{ width: '100%' }}
                          >
                            <option value="">— Sin asignar —</option>
                            {candidatos.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            <option value="otro">Otro (sin usuario)…</option>
                          </select>
                          {otro && (
                            <input
                              type="text"
                              placeholder="Nombre del supervisor"
                              maxLength={120}
                              value={escribiendo[p.id] ?? p.supervisorNombre ?? ''}
                              onChange={(e) => setEscribiendo((s) => ({ ...s, [p.id]: e.target.value }))}
                              onBlur={() => guardarNombre(p)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNombre(p); } }}
                              style={{ width: '100%', marginTop: 4 }}
                            />
                          )}
                        </>
                      ) : (
                        p.supervisorNombre ?? '—'
                      )}
                    </td>
                    <td>
                      {puedeEditar ? (
                        <select disabled={ocupado} value={p.jornada} onChange={(e) => void aplicar(() => editarPuntoCronograma(cronogramaId, p.id, { jornada: e.target.value }))} style={{ width: '100%' }}>
                          {JORNADAS_SUPERVISION.map((j) => <option key={j} value={j}>{j}</option>)}
                        </select>
                      ) : p.jornada}
                    </td>
                    {puedeEditar && (
                      <td>
                        <select
                          disabled={ocupado}
                          value=""
                          aria-label={`Rellenar los días de ${p.puestoNombre}`}
                          onChange={(e) => { const modo = e.target.value as ModoRelleno; if (modo) void aplicar(() => reemplazarDiasPunto(cronogramaId, p.id, diasSegunModo(modo, c.dias))); }}
                        >
                          <option value="">Rellenar…</option>
                          <option value="TODOS">Todos los días</option>
                          <option value="LUN_VIE">Lunes a viernes</option>
                          <option value="FIN_SEMANA">Fines de semana</option>
                          <option value="NINGUNO">Ninguno</option>
                        </select>
                      </td>
                    )}
                    {c.dias.map((f) => {
                      const estado: EstadoDiaSupervision = p.estados[f];
                      const e = estado ? ESTILO[estado] : null;
                      return (
                        <td key={f} style={{ padding: 2, textAlign: 'center' }}>
                          <button
                            type="button"
                            disabled={!puedeEditar || ocupado}
                            onClick={() => cambiarDia(p, f)}
                            title={e ? `${fechaCorta(f)}: ${e.titulo}` : `${fechaCorta(f)}: sin visita planeada`}
                            aria-label={`${p.puestoNombre}, ${fechaCorta(f)}: ${e ? e.titulo : 'sin visita planeada'}`}
                            style={{
                              width: 26, height: 26, borderRadius: 4, border: '1px solid #e2e8f0', cursor: puedeEditar ? 'pointer' : 'default',
                              background: e?.fondo ?? '#fff', color: e?.color ?? '#cbd5e0', fontWeight: 700, fontSize: '0.8rem', padding: 0,
                            }}
                          >
                            {e?.texto ?? ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#718096', margin: '10px 0 0' }}>
          ✓ visita hecha · x planeada (en rojo si ya pasó sin visita) · + visita en un día no planeado. {puedeEditar ? 'Toca un día para planear o quitar la visita.' : ''}
        </p>
      </div>

      {confirmandoBorrar && (
        <ConfirmDialog
          title="Eliminar cronograma"
          message="¿Eliminar este cronograma? Se pierde el plan (puntos, supervisores y días). Las visitas ya registradas se conservan."
          confirmLabel="Eliminar"
          danger
          onConfirm={borrar}
          onCancel={() => setConfirmandoBorrar(false)}
        />
      )}
    </div>
  );
}
