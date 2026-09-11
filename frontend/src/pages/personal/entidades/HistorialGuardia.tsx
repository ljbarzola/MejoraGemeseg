import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Settings, Trash2, Info, Building2, ArrowRightLeft } from 'lucide-react';
import {
  getAsignaciones,
  deleteAsignacion,
  type AsignacionGuardia,
} from '../../../services/entidades.service';
import { getMovimientos, type MovimientoPersonal } from '../../../services/movimiento-personal.service';
import MovimientoDetalleModal from '../../../components/personal/MovimientoDetalleModal';
import ConfiguracionSistemasModal from '../../../components/personal/ConfiguracionSistemasModal';
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

type Evento =
  | { kind: 'asignacion'; fecha: string; data: AsignacionGuardia }
  | { kind: 'movimiento'; fecha: string; data: MovimientoPersonal };

interface GuardiaHistorial {
  cedula: string;
  nombre: string;
  eventos: Evento[];
  abierto: boolean; // tiene asignación activa o movimiento en proceso
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

  const handleEliminarAsignacion = async (a: AsignacionGuardia) => {
    if (!confirm(`¿Eliminar esta fila del historial de ${a.nombreGuardia}? Úsalo solo si el sync la generó por error — no afecta a la Entidad ni a sus requisitos.`)) return;
    setEliminandoId(a.id);
    try {
      await deleteAsignacion(a.id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo eliminar.');
    } finally {
      setEliminandoId(null);
    }
  };

  const guardias = useMemo(() => {
    const map = new Map<string, GuardiaHistorial>();
    const ensure = (cedula: string, nombre: string) => {
      let g = map.get(cedula);
      if (!g) {
        g = { cedula, nombre, eventos: [], abierto: false };
        map.set(cedula, g);
      }
      return g;
    };
    asignaciones.forEach((a) => {
      const g = ensure(a.cedula, a.nombreGuardia);
      g.eventos.push({ kind: 'asignacion', fecha: a.fechaInicio, data: a });
      if (!a.fechaFin) g.abierto = true;
    });
    movimientos.forEach((m) => {
      const g = ensure(m.cedula, m.nombreGuardia);
      g.eventos.push({ kind: 'movimiento', fecha: m.createdAt, data: m });
      if (m.estado !== 'COMPLETADO') g.abierto = true;
    });
    const list = Array.from(map.values());
    list.forEach((g) => g.eventos.sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime()));
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
            <button className="btn-secondary" onClick={() => setShowConfigSistemas(true)} title="Configurar sistemas de ingreso/salida">
              <Settings size={16} /> Configurar sistemas
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
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
            {filtered.map((g) => (
              <div key={g.cedula} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <strong style={{ color: 'var(--azul-oscuro)', fontSize: '0.92rem' }}>{g.nombre}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#718096', fontFamily: 'monospace' }}>{g.cedula}</span>
                  {!g.abierto && (
                    <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>Sin movimiento activo</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {g.eventos.map((ev) =>
                    ev.kind === 'asignacion' ? (
                      <div key={`a-${ev.data.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', flexWrap: 'wrap' }}>
                        <Building2 size={14} color="#718096" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--azul-oscuro)', fontWeight: 600 }}>
                          {ev.data.entidad?.nombre || `Entidad #${ev.data.entidadId}`}
                        </span>
                        {ev.data.entidad && (
                          <span className="status-badge" style={{ background: TIPO_COLOR[ev.data.entidad.tipo]?.bg, color: TIPO_COLOR[ev.data.entidad.tipo]?.fg }}>
                            {ev.data.entidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'}
                          </span>
                        )}
                        <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                          {formatFecha(ev.data.fechaInicio)} → {ev.data.fechaFin ? formatFecha(ev.data.fechaFin) : 'actual'}
                        </span>
                        <span className="status-badge" style={{ background: ev.data.fechaFin ? '#e2e8f0' : '#c6f6d5', color: ev.data.fechaFin ? '#4a5568' : '#276749', marginLeft: 'auto' }}>
                          ● {ev.data.fechaFin ? 'Cerrada' : 'Activa'}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => handleEliminarAsignacion(ev.data)}
                            disabled={eliminandoId === ev.data.id}
                            title="Eliminar esta fila (solo si el sync la generó por error)"
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={`m-${ev.data.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#fffaf0', borderRadius: '8px', flexWrap: 'wrap' }}>
                        <ArrowRightLeft size={14} color="#975a16" style={{ flexShrink: 0 }} />
                        <span className="status-badge" style={{
                          background: ev.data.tipo === 'ENTRADA' ? '#bfdbfe' : '#fed7d7',
                          color: ev.data.tipo === 'ENTRADA' ? '#1d4ed8' : '#c53030',
                        }}>
                          {ev.data.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#718096' }}>{formatFecha(ev.data.createdAt)}</span>
                        <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                          {ev.data.items.filter((i) => i.completado).length}/{ev.data.items.length} sistemas
                        </span>
                        <span className="status-badge" style={{
                          background: ev.data.estado === 'COMPLETADO' ? '#c6f6d5' : '#fefcbf',
                          color: ev.data.estado === 'COMPLETADO' ? '#276749' : '#975a16',
                          marginLeft: 'auto',
                        }}>
                          {ev.data.estado === 'COMPLETADO' ? 'Completado' : 'En proceso'}
                        </span>
                        <button
                          onClick={() => setDetalleId(ev.data.id)}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          Ver detalle
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MovimientoDetalleModal movimientoId={detalleId} onClose={() => setDetalleId(null)} onChanged={load} />
      <ConfiguracionSistemasModal open={showConfigSistemas} onClose={() => setShowConfigSistemas(false)} />
    </div>
  );
}
