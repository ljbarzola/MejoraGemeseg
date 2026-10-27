import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getAgentHistory, getAgentHistorySummary } from '../../services/agent.service';
import type { PreguntaAgente, ResumenPreguntasAgentes } from '../../types/agent';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import { FILTRO_FECHA_VACIO, type FiltroFechaValor } from '../../utils/rangoFechas';
import FiltroFecha from '../common/FiltroFecha';
import FilterField from '../common/FilterField';
import ClearFiltersButton from '../common/ClearFiltersButton';

const segundos = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// Nombre de pantalla de las consultas de datos que puede pedir el agente.
const CONSULTA_LABEL: Record<string, string> = {
  ventas_expediente: 'Expediente de un cliente',
  ventas_prioridades: 'Plan del día',
  ventas_inactivos: 'Clientes inactivos',
  ventas_cartera: 'Cartera',
  ventas_perdidos: 'Lo que se perdió',
  ventas_embudo: 'Embudo de ventas',
  ventas_contratos: 'Contratos',
  ventas_documentos: 'Documentos',
  ventas_resumen: 'Panorama de clientes',
  ventas_clientes_hoy: 'Clientes de hoy',
  ventas_cliente: 'Ficha de un cliente',
  ventas_clientes_lista: 'Lista de clientes',
  ventas_estancados: 'Clientes estancados',
  ventas_por_responsable: 'Clientes por responsable',
  ventas_periodo: 'Clientes del periodo',
  list_projects: 'Proyectos',
  count_tasks_by_status: 'Tareas por estado',
  user_info: 'Datos del usuario',
  project_summary: 'Resumen de un proyecto',
  list_my_tasks: 'Mis tareas',
  cacao_resumen: 'Resumen de Cacao',
  custodias_resumen: 'Resumen de Custodias',
  rrhh_resumen_personal: 'Resumen de personal',
};

const PASO = 20;

/**
 * Lo que se les ha preguntado a los agentes de chat: por agente (cuántas preguntas, cuántas personas,
 * cuánto tarda, cuántos tokens) y cada pregunta con su respuesta completa, quién la hizo, desde qué
 * pantalla, cuánto tardó, los tokens y la consulta de datos que usó. Sistemas → Agentes. Solo se ve
 * lo de la propia empresa.
 */
export default function HistorialPreguntasAgentes({ agentId }: { agentId?: number }) {
  const [resumen, setResumen] = useState<ResumenPreguntasAgentes | null>(null);
  const [items, setItems] = useState<PreguntaAgente[]>([]);
  const [total, setTotal] = useState(0);
  const [persona, setPersona] = useState('');
  const [fecha, setFecha] = useState<FiltroFechaValor>(FILTRO_FECHA_VACIO);
  const [limite, setLimite] = useState(PASO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    getAgentHistorySummary(30).then(setResumen).catch(() => setResumen(null));
  }, []);

  useEffect(() => {
    setCargando(true);
    setError('');
    getAgentHistory({
      agentId,
      userId: persona ? Number(persona) : undefined,
      desde: fecha.desde || undefined,
      hasta: fecha.hasta || undefined,
      limit: limite,
    })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => setError('No se pudo cargar el historial de preguntas.'))
      .finally(() => setCargando(false));
  }, [agentId, persona, fecha.desde, fecha.hasta, limite]);

  const agentes = (resumen?.agentes ?? []).filter((a) => !agentId || a.agentId === agentId);
  const sinFiltros = !persona && fecha.atajo === '';
  const limpiar = () => { setPersona(''); setFecha(FILTRO_FECHA_VACIO); setLimite(PASO); };

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#4a5568' }}>
        Lo que le han preguntado a {agentId ? 'este agente' : 'los agentes'} en tu empresa, con lo que respondió, cuánto tardó y los tokens que gastó. Esta pantalla solo la ve Sistemas.
      </p>

      {agentes.length > 0 && (
        <div className="tasks-table-wrapper" style={{ marginBottom: 18 }}>
          <table className="tasks-table">
            <thead>
              <tr>
                <th>Agente</th><th>Preguntas ({resumen?.dias ?? 30} días)</th><th>Personas</th><th>Fallos</th>
                <th>Tarda en promedio</th><th>Tokens</th><th>Tokens por pregunta</th><th>Última vez</th>
              </tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <tr key={a.agentId}>
                  <td style={{ fontWeight: 700 }}>{a.agentNombre}</td>
                  <td>{a.preguntas}</td>
                  <td>{a.personas}</td>
                  <td style={{ color: a.fallos ? '#c53030' : undefined, fontWeight: a.fallos ? 700 : undefined }}>{a.fallos}</td>
                  <td>{segundos(a.duracionPromedioMs)}</td>
                  <td>{a.tokens.toLocaleString('es-EC')}</td>
                  <td>{a.tokensPorPregunta.toLocaleString('es-EC')}</td>
                  <td>{formatFechaHoraSync(a.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <div className="filter-bar-fields">
          <FilterField label="Persona">
            <select className="filter-select" value={persona} onChange={(e) => { setPersona(e.target.value); setLimite(PASO); }}>
              <option value="">Todas</option>
              {(resumen?.personas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </FilterField>
          <FiltroFecha label="Fecha" valor={fecha} onChange={(v) => { setFecha(v); setLimite(PASO); }} title="Día en que se hizo la pregunta (hora de Ecuador)" />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={limpiar} disabled={sinFiltros} />
        </div>
      </div>

      <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Preguntas ({total})</h4>

      {error && <div className="form-error">{error}</div>}
      {cargando && items.length === 0 ? (
        <div className="loading-state">Cargando preguntas…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          {sinFiltros ? 'Todavía nadie le ha preguntado nada a este agente.' : 'No hay preguntas con esos filtros.'}
        </div>
      ) : (
        <>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Cuándo</th>{!agentId && <th>Agente</th>}<th>Quién</th><th>Pregunta</th><th>Tardó</th><th>Tokens</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <Fragment key={r.id}>
                    <tr onClick={() => setAbierto(abierto === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                      <td>{formatFechaHoraSync(r.createdAt)}</td>
                      {!agentId && <td>{r.agentNombre}</td>}
                      <td>{r.userNombre}</td>
                      <td style={{ maxWidth: 360 }}>
                        <div className="truncate" title={r.pregunta ?? ''}>{r.pregunta ?? '—'}</div>
                        {r.consulta && <div style={{ fontSize: '0.76rem', color: '#718096' }}>Consultó: {CONSULTA_LABEL[r.consulta] ?? r.consulta}</div>}
                      </td>
                      <td>{segundos(r.duracionMs)}</td>
                      <td>{r.tokens === null ? '—' : r.tokens.toLocaleString('es-EC')}</td>
                      <td>
                        {r.exito
                          ? <span style={{ color: '#276749', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 600 }}><CheckCircle2 size={14} /> Bien</span>
                          : <span style={{ color: '#c53030', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 600 }}><XCircle size={14} /> Falló</span>}
                      </td>
                    </tr>
                    {abierto === r.id && (
                      <tr>
                        <td colSpan={agentId ? 6 : 7} style={{ background: '#f7fafc', fontSize: '0.84rem', color: '#2d3748' }}>
                          <div style={{ marginBottom: 8 }}><strong>Pregunta:</strong>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{r.pregunta ?? '—'}</div>
                          </div>
                          <div style={{ marginBottom: 8 }}><strong>Respuesta:</strong>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{r.respuesta}</div>
                          </div>
                          {r.error && <div style={{ color: '#c53030', marginBottom: 6 }}><strong>Motivo del fallo:</strong> {r.error}</div>}
                          <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                            Desde: {r.contexto || '—'} · Modelo: {r.modelo ?? '—'} · Tokens: {r.tokens ?? '—'} · Tardó: {segundos(r.duracionMs)}
                            {r.detalle && typeof r.detalle.ms === 'number' && <> · Consulta de datos: {segundos(r.detalle.ms)}</>}
                            {r.detalle && typeof r.detalle.citas === 'number' && <> · Citas de evidencia: {r.detalle.citas}{Array.isArray(r.detalle.citasNoVerificadas) && r.detalle.citasNoVerificadas.length > 0 ? ` (${r.detalle.citasNoVerificadas.length} sin verificar)` : ''}</>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => setLimite((l) => l + PASO)}>Ver más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
