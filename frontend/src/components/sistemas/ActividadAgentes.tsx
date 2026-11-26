import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getAgentRuns, getAgentRunsSummary } from '../../services/agent.service';
import type { EjecucionAgente, ResumenActividadAgentes } from '../../types/agent';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';

const ACCION_LABEL: Record<string, string> = { LEER_BITACORA: 'Leer una bitácora' };

const segundos = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** A dónde lleva «sobre qué trabajó» el agente, si hay una pantalla para verlo. */
function enlaceDe(r: EjecucionAgente): string | null {
  return r.entidadTipo === 'CPBitacora' && r.entidadId ? `/operaciones/bitacoras/${r.entidadId}` : null;
}

/**
 * Qué han hecho los agentes que trabajan solos: por agente (cuántas veces, cuántas
 * fallaron, cuánto tardan, cuántos tokens) y las últimas veces, con quién lo pidió
 * y sobre qué. Sistemas → Agentes. Solo se ve lo de la propia empresa.
 */
export default function ActividadAgentes({ agentId: agentFijo }: { agentId?: number }) {
  const [agenteSel, setAgenteSel] = useState('');
  const agentId = agentFijo;
  // Sin agente fijo se filtra por nombre: algunos agentes automáticos (p. ej. Mejora Continua) no tienen ficha en el catálogo.
  const agentNombre = agentFijo === undefined && agenteSel ? agenteSel : undefined;
  const [resumen, setResumen] = useState<ResumenActividadAgentes | null>(null);
  const [items, setItems] = useState<EjecucionAgente[]>([]);
  const [total, setTotal] = useState(0);
  const [soloFallos, setSoloFallos] = useState(false);
  const [limite, setLimite] = useState(15);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    getAgentRunsSummary(30).then(setResumen).catch(() => setResumen(null));
  }, []);

  useEffect(() => {
    setCargando(true);
    setError('');
    getAgentRuns({ agentId, agentNombre, exito: soloFallos ? false : undefined, limit: limite })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => setError('No se pudo cargar la actividad de los agentes.'))
      .finally(() => setCargando(false));
  }, [agentId, agentNombre, soloFallos, limite]);

  const agentes = (resumen?.agentes ?? []).filter((a) => !agentId || a.agentId === agentId);

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#4a5568' }}>
        Lo que hicieron los agentes que trabajan solos en tu empresa durante los últimos {resumen?.dias ?? 30} días. Cada lectura queda registrada aquí con quién la pidió.
      </p>

      {agentes.length > 0 && (
        <div className="hist-resumen">
          {agentes.map((a) => (
            <div key={`${a.agentId}|${a.agentNombre}`} className="hist-resumen-card">
              <h4>{a.agentNombre}</h4>
              <div className="hist-resumen-datos">
                <div className="hist-dato"><b>{a.ejecuciones}</b><span>Veces</span></div>
                <div className={`hist-dato ${a.errores ? 'malo' : ''}`}><b>{a.errores}</b><span>Fallos</span></div>
                <div className="hist-dato"><b>{segundos(a.duracionPromedioMs)}</b><span>Promedio</span></div>
              </div>
              <div className="hist-resumen-pie">
                {a.tokens.toLocaleString('es-EC')} tokens · Última vez: {formatFechaHoraSync(a.ultima)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Últimas veces ({total})</h4>
        {agentFijo === undefined && (
          <select className="filter-select" aria-label="Filtrar por agente" value={agenteSel} onChange={(e) => { setAgenteSel(e.target.value); setLimite(15); }}>
            <option value="">Todos los agentes</option>
            {(resumen?.agentes ?? []).map((a) => <option key={`${a.agentId}|${a.agentNombre}`} value={a.agentNombre}>{a.agentNombre}</option>)}
          </select>
        )}
        <label style={{ fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloFallos} onChange={(e) => { setSoloFallos(e.target.checked); setLimite(15); }} /> Solo las que fallaron
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}
      {cargando && items.length === 0 ? (
        <div className="loading-state">Cargando actividad…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          {soloFallos ? 'Ninguna lectura falló.' : 'Todavía no hay actividad. Aparece aquí cuando alguien sube una bitácora y el agente la lee.'}
        </div>
      ) : (
        <>
          <div className="hist-lista">
            {items.map((r) => {
              const enlace = enlaceDe(r);
              const abierta = abierto === r.id;
              return (
                <div key={r.id} className={`hist-item ${r.exito ? 'ok' : 'falla'} ${abierta ? 'abierto' : ''}`}>
                  <button type="button" className="hist-item-cab" aria-expanded={abierta} onClick={() => setAbierto(abierta ? null : r.id)}>
                    <div className="hist-item-meta">
                      <span className="quien">{r.userNombre ?? 'Automático'}</span>
                      <span>{formatFechaHoraSync(r.createdAt)}</span>
                      <span className="hist-chip agente">{r.agentNombre}</span>
                      <span>{segundos(r.duracionMs)}</span>
                      {r.exito
                        ? <span className="hist-chip bien"><CheckCircle2 size={12} /> Bien</span>
                        : <span className="hist-chip mal"><XCircle size={12} /> Falló</span>}
                    </div>
                    <div className="hist-item-pregunta">
                      {ACCION_LABEL[r.accion] ?? r.accion}
                      {r.resumen ? ` — ${r.resumen}` : ''}
                    </div>
                  </button>
                  {abierta && (
                    <div className="hist-item-cuerpo">
                      {enlace && <div><Link to={enlace} className="enlace-tabla">Ver bitácora n.º {r.entidadId}</Link></div>}
                      {r.error && <div className="hist-error"><strong>Motivo del fallo:</strong> {r.error}</div>}
                      <div className="hist-tecnico">
                        <span>Modelo: <b>{r.modelo ?? '—'}</b></span>
                        <span>Tokens: <b>{r.tokensEntrada ?? '—'}</b> de entrada y <b>{r.tokensSalida ?? '—'}</b> de salida</span>
                        {r.detalle && Object.entries(r.detalle).map(([k, v]) => (
                          <span key={k}>{k}: <b>{Array.isArray(v) ? v.join(', ') || '—' : String(v ?? '—')}</b></span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {items.length < total && (
            <div className="hist-pie">
              <button className="btn-secondary" onClick={() => setLimite((l) => l + 30)}>Ver más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
