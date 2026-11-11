import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, UserX } from 'lucide-react';
import { getPuestosHoy } from '../../services/bitacoras.service';
import { anularAusencia } from '../../services/ausencias.service';
import { MOTIVO_AUSENCIA_LABEL, type EstadoCobertura, type GuardiaDelDia, type PuestoDelDia, type PuestosDelDia } from '../../types/bitacoras';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import NoLlegoModal from './NoLlegoModal';
import { usePerm } from '../../contexts/PermissionsContext';
import { diaMes, fechaConDia } from '../../utils/bitacoras';
import { mensajeError } from '../../utils/entregasCp';
import SubirBitacoraModal from './bitacoras/SubirBitacoraModal';

const COBERTURA: Record<EstadoCobertura, { texto: string; bg: string; fg: string }> = {
  CUBIERTO: { texto: 'Cubierto', bg: '#c6f6d5', fg: '#276749' },
  SIN_CUBRIR: { texto: 'Falta cobertura', bg: '#fed7d7', fg: '#c53030' },
  SIN_HORARIO: { texto: 'Sin horario', bg: '#feebc8', fg: '#c05621' },
  HORARIO_NO_APROBADO: { texto: 'Horario sin aprobar', bg: '#fefcbf', fg: '#975a16' },
};

function Cifra({ valor, etiqueta, alerta }: { valor: number; etiqueta: string; alerta?: boolean }) {
  const color = alerta && valor > 0 ? '#c53030' : 'var(--azul-oscuro)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: '0.78rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</span>
    </div>
  );
}

const botonChico: React.CSSProperties = { padding: '2px 10px', fontSize: '0.75rem' };

function DebeEstar({
  p,
  puedeEscribir,
  onNoLlego,
  onCubrir,
  onDeshacer,
}: {
  p: PuestoDelDia;
  puedeEscribir: boolean;
  onNoLlego: (g: GuardiaDelDia) => void;
  onCubrir: (g: GuardiaDelDia) => void;
  onDeshacer: (g: GuardiaDelDia) => void;
}) {
  if (p.cobertura === 'SIN_HORARIO') return <span style={{ color: '#a0aec0' }}>No hay horario que cubra hoy</span>;
  if (p.trabajando.length === 0) return <span style={{ color: '#c53030' }}>Nadie programado</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {p.trabajando.map((g) => {
        const a = g.ausencia;
        return (
          <div key={g.cedula}>
            <strong style={{ fontWeight: 600, textDecoration: a ? 'line-through' : undefined, color: a ? '#a0aec0' : undefined }}>{g.nombre}</strong>{' '}
            <span style={{ color: '#718096' }}>
              · {g.codigo}
              {g.horaInicio && g.horaFin ? ` ${g.horaInicio}–${g.horaFin}` : ''}
            </span>
            {a ? (
              <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>
                  No llegó · {MOTIVO_AUSENCIA_LABEL[a.motivo].toLowerCase()}{a.hora ? ` · ${a.hora}` : ''}
                </span>
                {a.estado === 'CUBIERTA' ? (
                  <span style={{ fontSize: '0.78rem', color: '#276749' }}>Lo cubre <strong>{a.reemplazoNombre}</strong></span>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#c53030' }}>Sin reemplazo</span>
                )}
                {puedeEscribir && (
                  <>
                    <button type="button" className="btn-secondary" style={botonChico} onClick={() => onCubrir(g)}>
                      {a.estado === 'CUBIERTA' ? 'Cambiar' : 'Elegir quién cubre'}
                    </button>
                    <button type="button" className="btn-secondary" style={botonChico} onClick={() => onDeshacer(g)} title="Se registró por error">
                      Deshacer
                    </button>
                  </>
                )}
              </div>
            ) : (
              puedeEscribir && (
                <button type="button" className="btn-secondary" style={{ ...botonChico, marginLeft: 6 }} onClick={() => onNoLlego(g)} title="Registrar que este guardia no llegó">
                  <UserX size={12} style={{ marginRight: 4 }} />No llegó
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * «Hoy en los puestos»: lo primero que mira un supervisor al empezar el turno y el jefe de supervisores
 * durante el día. Por puesto: quién debe estar hoy según el horario, si la cobertura mínima se cumple y qué
 * días de la última semana no tienen bitácora aunque el horario esperaba guardias. Los que piden atención
 * van arriba. No guarda nada: se calcula con el horario y las bitácoras que ya existen.
 */
export default function PuestosHoy() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('OPERACIONES');
  const [datos, setDatos] = useState<PuestosDelDia | null>(null);
  const [error, setError] = useState('');
  const [subiendoPuesto, setSubiendoPuesto] = useState<number | null>(null);
  // «No llegó» (falta nueva) o «Quién cubre» (falta ya registrada, con su id).
  const [falta, setFalta] = useState<{ puesto: PuestoDelDia; guardia: GuardiaDelDia; cubrirId?: number } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<GuardiaDelDia | null>(null);

  const cargar = () => {
    getPuestosHoy()
      .then((d) => { setDatos(d); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar el estado de hoy.')));
  };
  useEffect(cargar, []);

  const confirmarDeshacer = async () => {
    const g = deshaciendo;
    setDeshaciendo(null);
    if (!g?.ausencia) return;
    try {
      await anularAusencia(g.ausencia.id);
      cargar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo deshacer la falta.'));
    }
  };

  if (error) return <div className="form-error">{error}</div>;
  if (!datos) return <div className="loading-state">Cargando los puestos de hoy…</div>;

  const r = datos.resumen;
  return (
    <div className="admin-section" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--azul-oscuro)' }}>Hoy en los puestos · {fechaConDia(r.fecha)}</h3>
        {r.puestos > 0 && (
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Cifra valor={r.puestos} etiqueta="puestos" />
            <Cifra valor={r.sinCubrir} etiqueta="sin cubrir" alerta />
            <Cifra valor={r.faltasSinCubrir} etiqueta="faltas sin reemplazo" alerta />
            <Cifra valor={r.sinHorario} etiqueta="sin horario" alerta />
            <Cifra valor={r.conBitacorasSinSubir} etiqueta="con bitácoras por subir" alerta />
          </div>
        )}
      </div>

      {datos.puestos.length === 0 ? (
        <div className="empty-state">No hay contratos activos con puestos hoy. Crea un contrato y sus puestos en Contratos.</div>
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead>
              <tr>
                <th>Puesto</th>
                <th>Debe estar hoy</th>
                <th>Libres hoy</th>
                <th>Cobertura</th>
                <th>Bitácoras por subir (7 días)</th>
                <th className="col-acciones col-acciones--ancha" title="Acciones"><span className="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {datos.puestos.map((p) => {
                const c = COBERTURA[p.cobertura];
                return (
                  <tr key={p.puestoId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.puestoNombre}</div>
                      <Link to={`/operaciones/contratos/${p.contratoId}`} className="enlace-tabla" style={{ fontSize: '0.78rem', color: '#718096' }}>
                        {p.entidadNombre} · {p.contratoNumero}
                      </Link>
                    </td>
                    <td>
                      <DebeEstar
                        p={p}
                        puedeEscribir={puedeEscribir}
                        onNoLlego={(g) => setFalta({ puesto: p, guardia: g })}
                        onCubrir={(g) => setFalta({ puesto: p, guardia: g, cubrirId: g.ausencia?.id })}
                        onDeshacer={setDeshaciendo}
                      />
                    </td>
                    <td style={{ color: '#718096' }}>{p.libres.length ? p.libres.map((l) => l.nombre).join(', ') : '—'}</td>
                    <td>
                      <span className="status-badge" style={{ background: c.bg, color: c.fg }}>{c.texto}</span>
                      {p.cobertura === 'SIN_CUBRIR' && (
                        <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: 2 }}>
                          {p.trabajando.filter((g) => !g.ausencia || g.ausencia.estado === 'CUBIERTA').length} de {p.minimo} {p.minimo === 1 ? 'guardia' : 'guardias'}
                        </div>
                      )}
                      {p.ausentesSinCubrir > 0 && p.cobertura !== 'SIN_CUBRIR' && (
                        <div style={{ fontSize: '0.75rem', color: '#c53030', marginTop: 2 }}>
                          {p.ausentesSinCubrir} {p.ausentesSinCubrir === 1 ? 'falta sin reemplazo' : 'faltas sin reemplazo'}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.bitacorasSinSubir.length === 0 ? (
                        <span style={{ color: '#a0aec0' }}>Al día</span>
                      ) : (
                        <>
                          <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>
                            {p.bitacorasSinSubir.length} {p.bitacorasSinSubir.length === 1 ? 'día' : 'días'}
                          </span>
                          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: 2 }}>{p.bitacorasSinSubir.map(diaMes).join(', ')}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="acciones-iconos" style={{ alignItems: 'center' }}>
                        {p.cobertura === 'SIN_HORARIO' ? (
                          <button type="button" className="btn-secondary" onClick={() => navigate(`/operaciones/horarios?contratoId=${p.contratoId}`)}>Ver horarios</button>
                        ) : puedeEscribir ? (
                          <button type="button" className="btn-secondary" onClick={() => setSubiendoPuesto(p.puestoId)} title="Subir la foto de la bitácora de este puesto">
                            <Camera size={14} style={{ marginRight: 4 }} />Subir bitácora
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {falta && (
        <NoLlegoModal
          puestoId={falta.puesto.puestoId}
          puestoNombre={falta.puesto.puestoNombre}
          guardia={{ cedula: falta.guardia.cedula, nombre: falta.guardia.nombre }}
          fecha={datos.resumen.fecha}
          cubrirId={falta.cubrirId}
          onClose={() => setFalta(null)}
          onSaved={() => { setFalta(null); cargar(); }}
        />
      )}
      {deshaciendo && (
        <ConfirmDialog
          title="Deshacer la falta"
          message={`¿Quitar la falta de ${deshaciendo.nombre}? Úsalo si se registró por error.`}
          confirmLabel="Quitar falta"
          onConfirm={confirmarDeshacer}
          onCancel={() => setDeshaciendo(null)}
        />
      )}

      {subiendoPuesto !== null && (
        <SubirBitacoraModal
          puestoInicial={subiendoPuesto}
          onClose={() => setSubiendoPuesto(null)}
          onSubida={(id) => {
            setSubiendoPuesto(null);
            navigate(`/operaciones/bitacoras/${id}`);
          }}
        />
      )}
    </div>
  );
}
