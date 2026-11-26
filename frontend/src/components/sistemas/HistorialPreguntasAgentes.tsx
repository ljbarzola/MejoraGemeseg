import { useEffect, useState } from 'react';
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
  custodia_viajes: 'Viajes de un guardia',
  custodia_antiguedad: 'Antigüedad de un custodio',
  custodia_placas_puerto: 'Placas en Puerto',
  custodia_top_hacienda: 'Custodios de Hacienda',
  rrhh_resumen_personal: 'Resumen de personal',
};

const PASO = 20;

/**
 * Lo que se les ha preguntado a los agentes de chat: por agente (cuántas preguntas, cuántas personas,
 * cuánto tarda, cuántos tokens) y cada pregunta con su respuesta completa, quién la hizo, desde qué
 * pantalla, cuánto tardó, los tokens y la consulta de datos que usó. Sistemas → Agentes. Solo se ve
 * lo de la propia empresa.
 */
export default function HistorialPreguntasAgentes({ agentId: agentFijo }: { agentId?: number }) {
  // Con un agente fijo (ventana de una tarjeta) no se elige; en la pestaña general se filtra por agente.
  const [agenteSel, setAgenteSel] = useState('');
  const agentId = agentFijo ?? (agenteSel ? Number(agenteSel) : undefined);
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
  const sinFiltros = !persona && fecha.atajo === '' && !agenteSel;
  const limpiar = () => { setPersona(''); setAgenteSel(''); setFecha(FILTRO_FECHA_VACIO); setLimite(PASO); };

  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#4a5568' }}>
        Lo que le han preguntado a {agentId ? 'este agente' : 'los agentes'} en tu empresa, con lo que respondió, cuánto tardó y los tokens que gastó. Esta pantalla solo la ve Sistemas.
      </p>

      {agentes.length > 0 && (
        <div className="hist-resumen">
          {agentes.map((a) => (
            <div key={a.agentId} className="hist-resumen-card">
              <h4>{a.agentNombre}</h4>
              <div className="hist-resumen-datos">
                <div className="hist-dato"><b>{a.preguntas}</b><span>Preguntas</span></div>
                <div className="hist-dato"><b>{a.personas}</b><span>Personas</span></div>
                <div className={`hist-dato ${a.fallos ? 'malo' : ''}`}><b>{a.fallos}</b><span>Fallos</span></div>
              </div>
              <div className="hist-resumen-pie">
                Tarda {segundos(a.duracionPromedioMs)} · {a.tokens.toLocaleString('es-EC')} tokens ({a.tokensPorPregunta.toLocaleString('es-EC')} c/u) · últimos {resumen?.dias ?? 30} días
                <br />Última vez: {formatFechaHoraSync(a.ultima)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <div className="filter-bar-fields">
          {agentFijo === undefined && (
            <FilterField label="Agente">
              <select className="filter-select" value={agenteSel} onChange={(e) => { setAgenteSel(e.target.value); setLimite(PASO); }}>
                <option value="">Todos</option>
                {(resumen?.agentes ?? []).map((a) => <option key={a.agentId} value={a.agentId}>{a.agentNombre}</option>)}
              </select>
            </FilterField>
          )}
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

      <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>Preguntas ({total})</h4>

      {error && <div className="form-error">{error}</div>}
      {cargando && items.length === 0 ? (
        <div className="loading-state">Cargando preguntas…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          {sinFiltros ? 'Todavía nadie le ha preguntado nada a este agente.' : 'No hay preguntas con esos filtros.'}
        </div>
      ) : (
        <>
          <div className="hist-lista">
            {items.map((r) => {
              const abierta = abierto === r.id;
              return (
                <div key={r.id} className={`hist-item ${r.exito ? 'ok' : 'falla'} ${abierta ? 'abierto' : ''}`}>
                  <button type="button" className="hist-item-cab" aria-expanded={abierta} onClick={() => setAbierto(abierta ? null : r.id)}>
                    <div className="hist-item-meta">
                      <span className="quien">{r.userNombre}</span>
                      <span>{formatFechaHoraSync(r.createdAt)}</span>
                      {!agentId && <span className="hist-chip agente">{r.agentNombre}</span>}
                      {r.consulta && <span className="hist-chip consulta">Consultó: {CONSULTA_LABEL[r.consulta] ?? r.consulta}</span>}
                      <span>{segundos(r.duracionMs)}</span>
                      <span>{r.tokens === null ? '—' : `${r.tokens.toLocaleString('es-EC')} tokens`}</span>
                      {r.exito
                        ? <span className="hist-chip bien"><CheckCircle2 size={12} /> Bien</span>
                        : <span className="hist-chip mal"><XCircle size={12} /> Falló</span>}
                    </div>
                    <div className="hist-item-pregunta">{r.pregunta ?? '—'}</div>
                  </button>
                  {abierta && (
                    <div className="hist-item-cuerpo">
                      <div className="hist-burbuja p"><small>Pregunta</small>{r.pregunta ?? '—'}</div>
                      <div className="hist-burbuja r"><small>Respuesta del agente</small>{r.respuesta || '—'}</div>
                      {r.error && <div className="hist-error"><strong>Motivo del fallo:</strong> {r.error}</div>}
                      <div className="hist-tecnico">
                        <span>Desde: <b>{r.contexto || '—'}</b></span>
                        <span>Modelo: <b>{r.modelo ?? '—'}</b></span>
                        {r.detalle && typeof r.detalle.ms === 'number' && <span>Consulta de datos: <b>{segundos(r.detalle.ms)}</b></span>}
                        {r.detalle && typeof r.detalle.citas === 'number' && (
                          <span>Citas de evidencia: <b>{r.detalle.citas}{Array.isArray(r.detalle.citasNoVerificadas) && r.detalle.citasNoVerificadas.length > 0 ? ` (${r.detalle.citasNoVerificadas.length} sin verificar)` : ''}</b></span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {items.length < total && (
            <div className="hist-pie">
              <button className="btn-secondary" onClick={() => setLimite((l) => l + PASO)}>Ver más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
