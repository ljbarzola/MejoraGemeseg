import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Settings,
  Trash2,
  Info,
  Building2,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  getAsignaciones,
  deleteAsignacion,
  type AsignacionGuardia,
} from '../../../services/entidades.service';
import { getMovimientos, type MovimientoPersonal } from '../../../services/movimiento-personal.service';
import MovimientoDetalleModal from '../../../components/personal/MovimientoDetalleModal';
import ConfiguracionSistemasModal from '../../../components/personal/ConfiguracionSistemasModal';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { usePerm } from '../../../contexts/PermissionsContext';

const TIPO_COLOR: Record<string, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};

function formatFecha(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

// Dos fechas "coinciden exactamente" cuando representan el mismo día
// calendario (mismo criterio que usa formatFecha para mostrarlas) — nunca
// fusionamos si alguna es nula o si difieren, para no inventar una
// transición que el sync no generó explícitamente.
function mismaFecha(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const fa = formatFecha(a);
  const fb = formatFecha(b);
  return fa !== '—' && fa === fb;
}

function nombreEntidad(a: AsignacionGuardia): string {
  return a.entidad?.nombre || `Entidad #${a.entidadId}`;
}

type RenderItem =
  | { kind: 'asig-single'; sortFecha: string; asignacion: AsignacionGuardia }
  // chain: 2+ asignaciones consecutivas del mismo guardia donde el fechaFin
  // de una coincide exactamente con el fechaInicio de la siguiente.
  | { kind: 'asig-merged'; sortFecha: string; chain: AsignacionGuardia[] }
  | { kind: 'movimiento'; sortFecha: string; data: MovimientoPersonal };

interface GuardiaHistorial {
  cedula: string;
  nombre: string;
  renderItems: RenderItem[]; // ya combinados y ordenados desc por sortFecha
  activa: AsignacionGuardia | null; // asignación sin fechaFin, si existe
  abierto: boolean; // tiene asignación activa o movimiento en proceso
}

// Agrupa asignaciones consecutivas (ya ordenadas ascendente por fechaInicio)
// en cadenas cuando el fechaFin de una coincide exactamente con el
// fechaInicio de la siguiente. Si no coincide, cada una queda como bloque
// independiente — nunca se fusiona de forma incierta.
function construirBloquesAsignacion(asigsAsc: AsignacionGuardia[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < asigsAsc.length) {
    const chain = [asigsAsc[i]];
    let j = i;
    while (j + 1 < asigsAsc.length && mismaFecha(asigsAsc[j].fechaFin, asigsAsc[j + 1].fechaInicio)) {
      chain.push(asigsAsc[j + 1]);
      j += 1;
    }
    if (chain.length > 1) {
      const ultima = chain[chain.length - 1];
      items.push({ kind: 'asig-merged', sortFecha: ultima.fechaInicio, chain });
    } else {
      items.push({ kind: 'asig-single', sortFecha: chain[0].fechaInicio, asignacion: chain[0] });
    }
    i = j + 1;
  }
  return items;
}

function getResumen(g: GuardiaHistorial): string {
  if (g.activa) {
    return `En ${nombreEntidad(g.activa)} desde ${formatFecha(g.activa.fechaInicio)}`;
  }
  const movEnProceso = g.renderItems.find(
    (it): it is Extract<RenderItem, { kind: 'movimiento' }> => it.kind === 'movimiento' && it.data.estado !== 'COMPLETADO',
  );
  if (movEnProceso) {
    return `${movEnProceso.data.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} en proceso desde ${formatFecha(movEnProceso.data.createdAt)}`;
  }
  return 'Sin movimiento activo';
}

/**
 * Une lo que antes eran dos pantallas separadas contando la misma historia
 * desde ángulos distintos: "Asignaciones de Guardias a Entidades" (a qué
 * entidad estuvo asignado, generado 100% por el sync de Drive) y
 * "Movimientos de Personal" (entradas/salidas y su checklist de sistemas).
 * Siguen siendo dos tablas de origen distintas (AsignacionGuardia es un
 * historial de solo lectura que solo escribe el sync; MovimientoPersonal es
 * el flujo operativo de entrada/salida) — esta pantalla solo las combina
 * por guardia para verlas juntas, no fusiona los datos.
 */
export default function HistorialGuardia() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');

  const [asignaciones, setAsignaciones] = useState<AsignacionGuardia[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoPersonal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [mostrarCerrados, setMostrarCerrados] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [showConfigSistemas, setShowConfigSistemas] = useState(false);
  const [confirmandoEliminarAsignacion, setConfirmandoEliminarAsignacion] = useState<AsignacionGuardia | null>(null);
  const [eliminarAsignacionError, setEliminarAsignacionError] = useState('');
  const eliminarAsignacionErrorRef = useRef<HTMLDivElement>(null);

  // Acordeón: qué tarjetas de guardia están expandidas. Empieza vacío para
  // que todas carguen colapsadas; es independiente de `abierto` (que sigue
  // significando "tiene un caso activo", no "está expandida en pantalla").
  const [expandedCedulas, setExpandedCedulas] = useState<Set<string>>(new Set());
  const toggleExpanded = (cedula: string) => {
    setExpandedCedulas((prev) => {
      const next = new Set(prev);
      if (next.has(cedula)) next.delete(cedula);
      else next.add(cedula);
      return next;
    });
  };

  // La fila puede estar abajo en una lista larga; se hace scrollIntoView para
  // que RRHH no se pierda el error si ya había bajado el scroll.
  useEffect(() => {
    if (eliminarAsignacionError) {
      eliminarAsignacionErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [eliminarAsignacionError]);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([getAsignaciones(), getMovimientos()])
      .then(([a, m]) => {
        setAsignaciones(a || []);
        setMovimientos(m || []);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleEliminarAsignacion = (a: AsignacionGuardia) => {
    setEliminarAsignacionError('');
    setConfirmandoEliminarAsignacion(a);
  };

  const confirmarEliminarAsignacion = async () => {
    const a = confirmandoEliminarAsignacion;
    if (!a) return;
    setConfirmandoEliminarAsignacion(null);
    setEliminandoId(a.id);
    try {
      await deleteAsignacion(a.id);
      load();
    } catch (err: any) {
      setEliminarAsignacionError(err.response?.data?.message || 'No se pudo eliminar.');
    } finally {
      setEliminandoId(null);
    }
  };

  const guardias = useMemo(() => {
    type Acc = { cedula: string; nombre: string; asigs: AsignacionGuardia[]; movs: MovimientoPersonal[]; abierto: boolean };
    const map = new Map<string, Acc>();
    const ensure = (cedula: string, nombre: string) => {
      let g = map.get(cedula);
      if (!g) {
        g = { cedula, nombre, asigs: [], movs: [], abierto: false };
        map.set(cedula, g);
      }
      return g;
    };
    asignaciones.forEach((a) => {
      const g = ensure(a.cedula, a.nombreGuardia);
      g.asigs.push(a);
      if (!a.fechaFin) g.abierto = true;
    });
    movimientos.forEach((m) => {
      const g = ensure(m.cedula, m.nombreGuardia);
      g.movs.push(m);
      if (m.estado !== 'COMPLETADO') g.abierto = true;
    });

    const list: GuardiaHistorial[] = Array.from(map.values()).map((acc) => {
      const asigsAsc = [...acc.asigs].sort((x, y) => new Date(x.fechaInicio).getTime() - new Date(y.fechaInicio).getTime());
      const asigItems = construirBloquesAsignacion(asigsAsc);
      const movItems: RenderItem[] = acc.movs.map((m) => ({ kind: 'movimiento', sortFecha: m.createdAt, data: m }));
      const renderItems = [...asigItems, ...movItems].sort(
        (x, y) => new Date(y.sortFecha).getTime() - new Date(x.sortFecha).getTime(),
      );
      const activa = asigsAsc.find((a) => !a.fechaFin) || null;
      return { cedula: acc.cedula, nombre: acc.nombre, renderItems, activa, abierto: acc.abierto };
    });
    list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [asignaciones, movimientos]);

  const filtered = guardias.filter((g) => {
    const matchesSearch = !search.trim() || g.nombre.toLowerCase().includes(search.toLowerCase()) || g.cedula.includes(search.trim());
    if (!matchesSearch) return false;
    if (!mostrarCerrados && !g.abierto) return false;
    return true;
  });

  const cerradosCount = guardias.length - guardias.filter((g) => g.abierto).length;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS · CUMPLIMIENTO</p>
            <h1>Historial</h1>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : undefined} /> {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            <button
              type="button"
              className="btn-icon-toolbar"
              onClick={() => setShowConfigSistemas(true)}
              title="Sistemas de ingreso y salida"
              aria-label="Sistemas de ingreso y salida"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {eliminarAsignacionError && (
        <div ref={eliminarAsignacionErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{eliminarAsignacionError}</div>
      )}

      <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#2b6cb0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Info size={15} style={{ flexShrink: 0 }} />
        <span>
          Combina, por guardia, a qué entidades estuvo asignado (se genera solo al sincronizar Drive desde{' '}
          <button
            onClick={() => navigate('/rrhh/guardias', { state: { from: location.pathname } })}
            style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            Listado de Guardias
          </button>
          ) y sus entradas/salidas de personal.
        </span>
      </div>

      <div className="admin-section">
        <div className="filter-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: '200px', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
          {cerradosCount > 0 && (
            <button onClick={() => setMostrarCerrados((v) => !v)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
              {mostrarCerrados ? 'Ocultar sin movimiento activo' : `Mostrar todos (${cerradosCount} sin movimiento activo)`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Cargando historial...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {guardias.length === 0 ? 'No hay historial todavía.' : 'No hay guardias que coincidan con estos filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filtered.map((g) => {
              const expanded = expandedCedulas.has(g.cedula);
              return (
                <div key={g.cedula} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px' }}>
                  <button
                    onClick={() => toggleExpanded(g.cedula)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown size={16} color="#718096" style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color="#718096" style={{ flexShrink: 0 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--azul-oscuro)', fontSize: '0.92rem' }}>{g.nombre}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#718096', fontFamily: 'monospace' }}>{g.cedula}</span>
                        {!g.abierto && (
                          <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>Sin movimiento activo</span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#718096' }}>{getResumen(g)}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                      {g.renderItems.map((item) => {
                        if (item.kind === 'asig-single') {
                          const a = item.asignacion;
                          return (
                            <div key={`a-${a.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', flexWrap: 'wrap' }}>
                              <Building2 size={14} color="#718096" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.82rem', color: 'var(--azul-oscuro)', fontWeight: 600 }}>
                                {nombreEntidad(a)}
                              </span>
                              {a.entidad && (
                                <span className="status-badge" style={{ background: TIPO_COLOR[a.entidad.tipo]?.bg, color: TIPO_COLOR[a.entidad.tipo]?.fg }}>
                                  {a.entidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'}
                                </span>
                              )}
                              <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                                Desde el {formatFecha(a.fechaInicio)} hasta {a.fechaFin ? formatFecha(a.fechaFin) : 'hoy'}
                              </span>
                              <span className="status-badge" style={{ background: a.fechaFin ? '#e2e8f0' : '#c6f6d5', color: a.fechaFin ? '#4a5568' : '#276749', marginLeft: 'auto' }}>
                                ● {a.fechaFin ? 'Cerrada' : 'Activa'}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={() => handleEliminarAsignacion(a)}
                                  disabled={eliminandoId === a.id}
                                  title="Eliminar esta fila (solo si el sync la generó por error)"
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          );
                        }
                        if (item.kind === 'asig-merged') {
                          const { chain } = item;
                          // Fechas de cada cambio: el fechaInicio de cada eslabón salvo el primero.
                          const fechasCambio = chain.slice(1).map((a) => formatFecha(a.fechaInicio));
                          const textoFechas =
                            fechasCambio.length === 1
                              ? `cambió el ${fechasCambio[0]}`
                              : `cambió el ${fechasCambio.slice(0, -1).join(', ')} y el ${fechasCambio[fechasCambio.length - 1]}`;
                          return (
                            <div key={`chain-${chain[0].id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', flexWrap: 'wrap' }}>
                              <Building2 size={14} color="#718096" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.82rem', color: 'var(--azul-oscuro)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                {chain.map((a, idx) => (
                                  <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    {idx > 0 && <ArrowRightLeft size={12} color="#a0aec0" />}
                                    {nombreEntidad(a)}
                                  </span>
                                ))}
                              </span>
                              <span style={{ fontSize: '0.78rem', color: '#718096' }}>, {textoFechas}</span>
                              <span className="status-badge" style={{ background: chain[chain.length - 1].fechaFin ? '#e2e8f0' : '#c6f6d5', color: chain[chain.length - 1].fechaFin ? '#4a5568' : '#276749', marginLeft: 'auto' }}>
                                ● {chain[chain.length - 1].fechaFin ? 'Cerrada' : 'Activa'}
                              </span>
                              {canEdit && (
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  {chain.map((a) => (
                                    <button
                                      key={a.id}
                                      onClick={() => handleEliminarAsignacion(a)}
                                      disabled={eliminandoId === a.id}
                                      title={`Eliminar el tramo con ${nombreEntidad(a)} (solo si el sync la generó por error)`}
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        const m = item.data;
                        const esEntrada = m.tipo === 'ENTRADA';
                        return (
                          <div
                            key={`m-${m.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              background: '#fffaf0',
                              borderRadius: '8px',
                              borderLeft: `3px solid ${esEntrada ? '#1d4ed8' : '#c53030'}`,
                              flexWrap: 'wrap',
                            }}
                          >
                            <ArrowRightLeft size={14} color="#975a16" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '0.82rem', color: 'var(--azul-oscuro)', fontWeight: 600 }}>
                              {esEntrada ? 'Contratado el' : 'Salió el'} {formatFecha(m.createdAt)}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                              {m.items.filter((i) => i.completado).length}/{m.items.length} sistemas
                            </span>
                            <span className="status-badge" style={{
                              background: m.estado === 'COMPLETADO' ? '#c6f6d5' : '#fefcbf',
                              color: m.estado === 'COMPLETADO' ? '#276749' : '#975a16',
                              marginLeft: 'auto',
                            }}>
                              {m.estado === 'COMPLETADO' ? 'Completado' : 'En proceso'}
                            </span>
                            <button
                              onClick={() => setDetalleId(m.id)}
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              Ver detalle
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MovimientoDetalleModal movimientoId={detalleId} onClose={() => setDetalleId(null)} onChanged={load} />
      <ConfiguracionSistemasModal open={showConfigSistemas} onClose={() => setShowConfigSistemas(false)} />

      {confirmandoEliminarAsignacion && (
        <ConfirmDialog
          title="Eliminar fila del historial"
          message={`¿Eliminar esta fila del historial de ${confirmandoEliminarAsignacion.nombreGuardia}? Úsalo solo si el sync la generó por error — no afecta a la Entidad ni a sus requisitos.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarAsignacion}
          onCancel={() => setConfirmandoEliminarAsignacion(null)}
        />
      )}
    </div>
  );
}
