import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Route, X, AlertTriangle } from 'lucide-react';
import { usePerm } from '../../../contexts/PermissionsContext';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import PageTabs from '../../../components/common/PageTabs';
import { getContratos } from '../../../services/contratacion-publica.service';
import {
  crearCronograma,
  getCronogramas,
  getMisVisitasHoy,
  getSinVisita,
} from '../../../services/supervision.service';
import type { CPContrato } from '../../../types/contratacion-publica';
import type { CronogramaResumen, MisVisitasHoy, SinVisita } from '../../../types/supervision';
import { proponerCiclo } from '../../../utils/cicloMensual';
import RegistrarVisitaModal from './RegistrarVisitaModal';

type Pestana = 'hoy' | 'cronogramas';
const PESTANAS = [
  { key: 'hoy' as const, label: 'Mis visitas de hoy', icon: ClipboardList },
  { key: 'cronogramas' as const, label: 'Cronogramas', icon: Route },
];

const fechaCorta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const PRESENTE_TEXTO = { SI: 'guardia presente', NO: 'guardia ausente', NO_APLICA: 'sin guardia que verificar' } as const;

/**
 * Supervisión: lo que cada supervisor debe visitar hoy y registra desde el celular, y el cronograma de
 * visitas de cada contrato (qué días se planea visitar cada punto, con su Excel firmable).
 */
export default function SupervisionPage() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('OPERACIONES');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('pestana');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'hoy';

  const [mis, setMis] = useState<MisVisitasHoy | null>(null);
  const [sin, setSin] = useState<SinVisita | null>(null);
  const [crons, setCrons] = useState<CronogramaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [visitando, setVisitando] = useState<{ puestoId: number; puestoNombre: string; fecha: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const cargar = () => {
    setCargando(true);
    setError('');
    Promise.all([getMisVisitasHoy(), getSinVisita(7), getCronogramas()])
      .then(([m, s, c]) => { setMis(m); setSin(s); setCrons(c); })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar la supervisión.'))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, []);

  return (
    <div className="page-container">
      <OperacionesPageHeader
        title="Supervisión"
        description="Qué puntos visita cada supervisor y cuándo, y el registro de lo que realmente se visitó."
        actions={
          pestana === 'cronogramas' && puedeEditar ? (
            <button className="auth-btn" onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo cronograma</button>
          ) : undefined
        }
      />
      <PageTabs label="Supervisión" tabs={PESTANAS} value={pestana} onChange={(key) => setParams({ pestana: key }, { replace: true })} />

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}
      {aviso && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.88rem' }}>{aviso}</div>
      )}
      {cargando && <div className="loading-state">Cargando...</div>}

      {!cargando && pestana === 'hoy' && mis && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {mis.puntos.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No tienes puntos asignados hoy. Quien arma el cronograma te asigna como supervisor de un punto en la pestaña «Cronogramas».
            </div>
          )}
          {mis.puntos.map((p) => (
            <div key={p.puntoId} className="admin-section" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{p.puestoNombre}</div>
              <div style={{ fontSize: '0.8rem', color: '#718096', marginBottom: 8 }}>{p.contratoNumero} · {p.entidadNombre} · {p.jornada}</div>
              <span className="status-badge" style={{ background: p.planificadaHoy ? '#bee3f8' : '#edf2f7', color: p.planificadaHoy ? '#2b6cb0' : '#4a5568' }}>
                {p.planificadaHoy ? 'Visita planeada hoy' : 'Hoy no está planeada'}
              </span>
              {p.visitasHoy.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '0.85rem' }}>
                  {p.visitasHoy.map((v) => (
                    <li key={v.id}>{v.hora} · {PRESENTE_TEXTO[v.guardiaPresente]}</li>
                  ))}
                </ul>
              )}
              {puedeEditar && (
                <button className="auth-btn" style={{ marginTop: 12, width: '100%', minHeight: 44 }} onClick={() => setVisitando({ puestoId: p.puestoId, puestoNombre: p.puestoNombre, fecha: mis.fecha })}>
                  <ClipboardList size={16} /> Registrar visita
                </button>
              )}
              {p.diasSinVisita.length > 0 && (
                <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#9c4221' }}>
                  <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Sin visita registrada:
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {p.diasSinVisita.map((f) => (
                      <button key={f} className="btn-secondary" style={{ padding: '4px 10px', minHeight: 32 }} onClick={() => setVisitando({ puestoId: p.puestoId, puestoNombre: p.puestoNombre, fecha: f })}>
                        {fechaCorta(f)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!cargando && pestana === 'cronogramas' && (
        <>
          {sin && sin.puntos.length > 0 && (
            <div className="admin-section" style={{ marginBottom: 16, borderLeft: '4px solid #ed8936' }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Puntos con visitas sin registrar (últimos {sin.ventanaDias} días)</h3>
              <div className="tasks-table-wrapper" style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="tasks-table">
                  <thead><tr><th>Punto</th><th>Contrato</th><th>Supervisor</th><th>Días sin visita</th></tr></thead>
                  <tbody>
                    {sin.puntos.map((p) => (
                      <tr key={`${p.cronogramaId}-${p.puestoId}`}>
                        <td style={{ fontWeight: 600 }}>{p.puestoNombre}</td>
                        <td>{p.contratoNumero}</td>
                        <td>{p.supervisorNombre ?? <span style={{ color: '#c53030' }}>Sin asignar</span>}</td>
                        <td>{p.dias.map(fechaCorta).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="admin-section">
            {crons.length === 0 ? (
              <div className="empty-state">Todavía no hay cronogramas de supervisión. {puedeEditar ? 'Pulsa «Nuevo cronograma» y elige el contrato.' : ''}</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead><tr><th>Contrato</th><th>Entidad</th><th>Periodo</th><th>Puntos</th><th>Sin supervisor</th><th className="col-acciones"><span className="visually-hidden">Acciones</span></th></tr></thead>
                  <tbody>
                    {crons.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.contratoNumero}</td>
                        <td>{c.entidadNombre}</td>
                        <td>{fechaCorta(c.fechaInicio)} – {fechaCorta(c.fechaFin)}</td>
                        <td>{c.puntos}</td>
                        <td style={{ color: c.sinSupervisor ? '#c53030' : undefined }}>{c.sinSupervisor || '—'}</td>
                        <td><button className="btn-secondary" onClick={() => navigate(`/operaciones/supervision/${c.id}`)}>Abrir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {visitando && (
        <RegistrarVisitaModal
          {...visitando}
          onClose={() => setVisitando(null)}
          onRegistrada={() => {
            setVisitando(null);
            setAviso('Visita registrada.');
            setTimeout(() => setAviso(''), 4000);
            cargar();
          }}
        />
      )}
      {nuevo && <NuevoCronogramaModal cronogramas={crons} onClose={() => setNuevo(false)} onCreado={(id) => navigate(`/operaciones/supervision/${id}`)} />}
    </div>
  );
}

/** Crear el cronograma de un contrato: propone las fechas del siguiente ciclo del contrato. */
function NuevoCronogramaModal({
  cronogramas,
  onClose,
  onCreado,
}: {
  cronogramas: CronogramaResumen[];
  onClose: () => void;
  onCreado: (id: number) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [contratos, setContratos] = useState<CPContrato[]>([]);
  const [contratoId, setContratoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getContratos().then((c) => setContratos(c.filter((x) => x.estado === 'ACTIVO'))).catch(() => setContratos([]));
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const elegir = (id: string) => {
    setContratoId(id);
    const c = contratos.find((x) => String(x.id) === id);
    if (!c) return;
    const fines = cronogramas.filter((x) => x.contratoId === c.id).map((x) => x.fechaFin).sort();
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const p = proponerCiclo(c.diaCorte, fines[fines.length - 1] ?? null, hoy);
    setDesde(p.desde);
    setHasta(p.hasta);
  };
  const aviso = useMemo(() => {
    const c = contratos.find((x) => String(x.id) === contratoId);
    return c?.diaCorte && c.diaCorte > 1 ? `Este contrato corta el día ${c.diaCorte}: se proponen las fechas de su siguiente ciclo.` : '';
  }, [contratos, contratoId]);

  const crear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const c = await crearCronograma({ contratoId: Number(contratoId), fechaInicio: desde, fechaFin: hasta });
      onCreado(c.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el cronograma.');
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo cronograma de supervisión</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={crear}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}
            <p style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 0 }}>
              Se crea con un punto por cada puesto del contrato, visitas planeadas todos los días y el supervisor del cronograma anterior (si lo hay). Luego lo ajustas.
            </p>
            <div className="form-group">
              <label>Contrato *</label>
              <select value={contratoId} onChange={(e) => elegir(e.target.value)} required>
                <option value="">-- Elegir contrato --</option>
                {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}{c.entidad ? ` · ${c.entidad.nombre}` : ''}</option>)}
              </select>
              {aviso && <small style={{ color: '#718096' }}>{aviso}</small>}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Desde *</label>
                <input type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Hasta *</label>
                <input type="date" required min={desde || undefined} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando || !contratoId || !desde || !hasta}>{guardando ? 'Creando...' : 'Crear cronograma'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
