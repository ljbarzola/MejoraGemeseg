import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getAgentRuns, getAgentRunsSummary } from '../../services/agent.service';
import type { EjecucionAgente, ResumenActividadAgentes } from '../../types/agent';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';

const ACCION_LABEL: Record<string, string> = { LEER_BITACORA: 'Leer una bitácora' };

const segundos = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** A dónde lleva «sobre qué trabajó» el agente, si hay una pantalla para verlo. */
function enlaceDe(r: EjecucionAgente): string | null {
  return r.entidadTipo === 'CPBitacora' && r.entidadId ? `/contratacion-publica/bitacoras/${r.entidadId}` : null;
}

/**
 * Qué han hecho los agentes que trabajan solos: por agente (cuántas veces, cuántas
 * fallaron, cuánto tardan, cuántos tokens) y las últimas veces, con quién lo pidió
 * y sobre qué. Sistemas → Agentes. Solo se ve lo de la propia empresa.
 */
export default function ActividadAgentes({ agentId }: { agentId?: number }) {
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
    getAgentRuns({ agentId, exito: soloFallos ? false : undefined, limit: limite })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => setError('No se pudo cargar la actividad de los agentes.'))
      .finally(() => setCargando(false));
  }, [agentId, soloFallos, limite]);

  const agentes = (resumen?.agentes ?? []).filter((a) => !agentId || a.agentId === agentId);

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#4a5568' }}>
        Lo que hicieron los agentes que trabajan solos en tu empresa durante los últimos {resumen?.dias ?? 30} días. Cada lectura queda registrada aquí con quién la pidió.
      </p>

      {agentes.length > 0 && (
        <div className="tasks-table-wrapper" style={{ marginBottom: 18 }}>
          <table className="tasks-table">
            <thead>
              <tr><th>Agente</th><th>Veces</th><th>Fallos</th><th>Tarda en promedio</th><th>Tokens</th><th>Última vez</th></tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <tr key={`${a.agentId}|${a.agentNombre}`}>
                  <td style={{ fontWeight: 700 }}>{a.agentNombre}</td>
                  <td>{a.ejecuciones}</td>
                  <td style={{ color: a.errores ? '#c53030' : undefined, fontWeight: a.errores ? 700 : undefined }}>{a.errores}</td>
                  <td>{segundos(a.duracionPromedioMs)}</td>
                  <td>{a.tokens.toLocaleString('es-EC')}</td>
                  <td>{formatFechaHoraSync(a.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Últimas veces ({total})</h4>
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
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Cuándo</th><th>Agente</th><th>Qué hizo</th><th>Lo pidió</th><th>Tardó</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const enlace = enlaceDe(r);
                  return (
                    <Fragment key={r.id}>
                      <tr onClick={() => setAbierto(abierto === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                        <td>{formatFechaHoraSync(r.createdAt)}</td>
                        <td>{r.agentNombre}</td>
                        <td>
                          {ACCION_LABEL[r.accion] ?? r.accion}
                          {enlace && <> · <Link to={enlace} className="enlace-tabla" onClick={(e) => e.stopPropagation()}>ver bitácora n.º {r.entidadId}</Link></>}
                          {r.resumen && <div style={{ fontSize: '0.76rem', color: '#718096' }}>{r.resumen}</div>}
                        </td>
                        <td>{r.userNombre ?? '—'}</td>
                        <td>{segundos(r.duracionMs)}</td>
                        <td>
                          {r.exito
                            ? <span style={{ color: '#276749', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 600 }}><CheckCircle2 size={14} /> Bien</span>
                            : <span style={{ color: '#c53030', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 600 }}><XCircle size={14} /> Falló</span>}
                        </td>
                      </tr>
                      {abierto === r.id && (
                        <tr>
                          <td colSpan={6} style={{ background: '#f7fafc', fontSize: '0.8rem', color: '#4a5568' }}>
                            {r.error && <div style={{ color: '#c53030', marginBottom: 4 }}><strong>Motivo del fallo:</strong> {r.error}</div>}
                            <div>
                              Modelo: {r.modelo ?? '—'} · Tokens: {r.tokensEntrada ?? '—'} de entrada y {r.tokensSalida ?? '—'} de salida
                            </div>
                            {r.detalle && (
                              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                {Object.entries(r.detalle).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '—' : String(v ?? '—')}`).join('\n')}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => setLimite((l) => l + 30)}>Ver más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
