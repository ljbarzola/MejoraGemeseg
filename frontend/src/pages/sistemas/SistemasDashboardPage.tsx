import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import { Tarjeta, KpiFila, Contador, BarraH, SinDatos, Cargando } from '../../components/ventas/dashboard/DashboardBits';
import { Dona } from '../../components/ventas/dashboard/DashboardGraficos';
import {
  getSistemasDashboardStats,
  getTicketsSoporte,
  getNovedades,
  type TicketSoporte,
  type NovedadApp,
  type SistemasDashboardStats,
} from '../../services/sistemas.service';
import { getAgentRunsSummary } from '../../services/agent.service';
import { getTools, getAssignments } from '../../services/tool.service';
import { getKnowledgeBase } from '../../services/knowledge-base.service';
import type { ResumenActividadAgentes } from '../../types/agent';
import type { Tool, ToolAssignment } from '../../types/tool';

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  ABIERTO: { bg: '#fed7d7', fg: '#c53030' },
  EN_REVISION: { bg: '#feebc8', fg: '#c05621' },
  RESUELTO: { bg: '#c6f6d5', fg: '#276749' },
};

const TIPO_LABEL: Record<string, string> = {
  ERROR: 'Error',
  MEJORA: 'Mejora',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

// Colores categóricos en orden fijo (validados con el skill dataviz). El color
// va con su nombre y cantidad en la leyenda: nunca es la única señal.
const TIPOS: { tipo: 'ERROR' | 'MEJORA' | 'PERMISO' | 'OTRO'; label: string; color: string }[] = [
  { tipo: 'ERROR', label: 'Errores', color: '#2a78d6' },
  { tipo: 'MEJORA', label: 'Mejoras', color: '#eb6834' },
  { tipo: 'PERMISO', label: 'Permisos', color: '#1baf7a' },
  { tipo: 'OTRO', label: 'Otros', color: '#eda100' },
];

// "—" mientras no haya tickets resueltos; si no, minutos, horas o días + horas.
function formatearHoras(horas: number | null): string {
  if (horas === null) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${Math.round(horas * 10) / 10} h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas - dias * 24);
  return resto ? `${dias} d ${resto} h` : `${dias} d`;
}

const numero = (n: number) => n.toLocaleString('es-EC');
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC');

/** Cada bloque se carga por separado: si uno falla (p. ej. no hay permiso), los demás se siguen viendo. */
interface Datos {
  stats: SistemasDashboardStats | null;
  tickets: TicketSoporte[] | null;
  agentes: ResumenActividadAgentes | null;
  herramientas: Tool[] | null;
  asignaciones: ToolAssignment[] | null;
  novedades: NovedadApp[] | null;
  conocimiento: string | null;
}

const BOTON_TARJETA = { padding: '6px 12px', fontSize: '0.8rem' } as const;

export default function SistemasDashboardPage() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  function cargar() {
    setError(false);
    const val = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
    Promise.allSettled([
      getSistemasDashboardStats(),
      getTicketsSoporte(),
      getAgentRunsSummary(30),
      getTools(),
      getAssignments(),
      getNovedades(),
      getKnowledgeBase(),
    ]).then((r) => {
      const todoFallo = r.every((x) => x.status === 'rejected');
      if (todoFallo) { setError(true); return; }
      setDatos({
        stats: val(r[0]),
        tickets: val(r[1]),
        agentes: val(r[2]),
        herramientas: val(r[3]),
        asignaciones: val(r[4]),
        novedades: val(r[5]),
        conocimiento: r[6].status === 'fulfilled' ? r[6].value.content : null,
      });
    });
  }

  useEffect(cargar, []);

  const encabezado = (
    <PageHeader
      eyebrow="Sistemas"
      title="Dashboard"
      description="Cómo va soporte, qué hacen los agentes de IA y qué hay asignado en herramientas, de un vistazo."
      actions={
        <>
          <button className="btn-secondary" onClick={() => navigate('/sistemas/novedades')}>Publicar novedad</button>
          <button className="auth-btn" onClick={() => navigate('/sistemas/soporte')}>Ver soporte técnico</button>
        </>
      }
    />
  );

  if (!datos) {
    return (
      <div className="page-container">
        {encabezado}
        <Cargando error={error} onReintentar={cargar} />
      </div>
    );
  }

  return (
    <div className="page-container">
      {encabezado}
      <Contenido datos={datos} />
    </div>
  );
}

function Contenido({ datos }: { datos: Datos }) {
  const navigate = useNavigate();
  const { stats, tickets, agentes, herramientas, asignaciones, novedades, conocimiento } = datos;

  const ultimosTickets = useMemo(() => (tickets ?? []).slice(0, 5), [tickets]);

  const totalEjecuciones = (agentes?.agentes ?? []).reduce((s, a) => s + a.ejecuciones, 0);
  const totalErrores = (agentes?.agentes ?? []).reduce((s, a) => s + a.errores, 0);
  const totalTokens = (agentes?.agentes ?? []).reduce((s, a) => s + a.tokens, 0);
  const maxEjecuciones = Math.max(0, ...(agentes?.agentes ?? []).map((a) => a.ejecuciones));

  const personasConHerramientas = new Set((asignaciones ?? []).map((a) => a.userId)).size;
  const sinLicencia = (asignaciones ?? []).filter((a) => !a.licenseKey?.trim()).length;
  const topHerramientas = [...(herramientas ?? [])]
    .sort((a, b) => (b._count?.assignments ?? 0) - (a._count?.assignments ?? 0))
    .slice(0, 6);
  const maxAsignadas = Math.max(0, ...topHerramientas.map((t) => t._count?.assignments ?? 0));

  // La base de conocimiento no guarda fecha de cambio: solo se puede decir si tiene texto y cuántos temas.
  const temas = conocimiento ? [...conocimiento.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()) : [];

  // Cada número, trozo de la dona y ticket lleva a Soporte técnico con su filtro (?estado=, ?tipo= o ?ticket=).
  const irSoporte = (consulta = '') => navigate(`/sistemas/soporte${consulta}`);

  return (
    <div className="dash-pila">
      <KpiFila className="dash-kpis--cuatro">
        {stats && (
          <>
            <Contador titulo="Tickets abiertos" valor={stats.abiertos} color="#c53030" detalle="Esperan respuesta" onClick={() => irSoporte('?estado=ABIERTO')} />
            <Contador titulo="En revisión" valor={stats.enRevision} color="#c05621" detalle="Se están atendiendo" onClick={() => irSoporte('?estado=EN_REVISION')} />
            <Contador titulo="Resueltos" valor={stats.resueltos} color="#276749" detalle={`${stats.totalMes} reportados este mes`} onClick={() => irSoporte('?estado=RESUELTO')} />
            <Contador
              titulo="Resolución promedio"
              valor={formatearHoras(stats.tiempoPromedioResolucionHoras)}
              color="#2a78d6"
              detalle={stats.ticketsConResolucion ? `Según ${stats.ticketsConResolucion} resueltos` : 'Aún sin resueltos'}
            />
          </>
        )}
        {agentes && (
          <Contador
            titulo="Trabajos de agentes"
            valor={numero(totalEjecuciones)}
            color={totalErrores > 0 ? '#c05621' : '#1baf7a'}
            detalle={totalErrores > 0 ? `${totalErrores} con error · ${agentes.dias} días` : `Sin errores · ${agentes.dias} días`}
            onClick={() => navigate('/sistemas/agentes')}
          />
        )}
        {asignaciones && (
          <Contador
            titulo="Herramientas"
            valor={numero(asignaciones.length)}
            color="#6b46c1"
            detalle={`Asignadas a ${personasConHerramientas} ${personasConHerramientas === 1 ? 'persona' : 'personas'}`}
            onClick={() => navigate('/sistemas/herramientas')}
          />
        )}
      </KpiFila>

      <div className="dash-grid">
        <Tarjeta titulo="Soporte por tipo" hint="Qué piden más las personas desde la app.">
          {stats ? (
            <Dona
              aria="Tickets de soporte por tipo"
              centroTitulo="tickets"
              segmentos={TIPOS.map((t) => ({
                key: t.tipo, etiqueta: t.label, color: t.color, valor: stats.porTipo?.[t.tipo] ?? 0, onClick: () => irSoporte(`?tipo=${t.tipo}`),
              }))}
            />
          ) : (
            <SinDatos texto="No se pudo cargar el soporte técnico." />
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Últimos tickets"
          hint="Los cinco más recientes."
          accion={<button className="btn-secondary" style={BOTON_TARJETA} onClick={() => irSoporte()}>Ver todos</button>}
        >
          {!tickets ? (
            <SinDatos texto="No se pudieron cargar los tickets." />
          ) : ultimosTickets.length === 0 ? (
            <SinDatos texto="Todavía no hay tickets." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ultimosTickets.map((t) => {
                const color = ESTADO_COLOR[t.estado] || ESTADO_COLOR.ABIERTO;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => irSoporte(`?ticket=${t.id}`)}
                    style={{
                      padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', textAlign: 'left',
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#718096' }}>
                        {TIPO_LABEL[t.tipo]} · {fecha(t.createdAt)}
                      </span>
                      <span className="truncate" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>{t.titulo}</span>
                    </span>
                    <span className="status-badge" style={{ background: color.bg, color: color.fg, fontSize: '0.72rem', flex: '0 0 auto' }}>
                      {t.estado.replace('_', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Agentes de IA"
          hint={agentes ? `Trabajos de los agentes que actúan solos, últimos ${agentes.dias} días.` : undefined}
          accion={<button className="btn-secondary" style={BOTON_TARJETA} onClick={() => navigate('/sistemas/agentes')}>Ver actividad</button>}
        >
          {!agentes ? (
            <SinDatos texto="No se pudo cargar la actividad de los agentes." />
          ) : agentes.agentes.length === 0 ? (
            <SinDatos texto="Ningún agente ha trabajado en este periodo." />
          ) : (
            <>
              {agentes.agentes.map((a) => (
                <BarraH
                  key={`${a.agentId ?? a.agentNombre}`}
                  etiqueta={a.agentNombre}
                  valor={a.ejecuciones}
                  max={maxEjecuciones}
                  color={a.errores > 0 ? '#c05621' : '#1baf7a'}
                  detalle={a.errores > 0 ? `${a.ejecuciones} · ${a.errores} con error` : `${a.ejecuciones}`}
                />
              ))}
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#718096' }}>
                {numero(totalTokens)} tokens gastados en total.
              </p>
            </>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Herramientas"
          hint={herramientas && asignaciones ? `${herramientas.length} en el catálogo · ${sinLicencia} asignaciones sin clave de licencia.` : undefined}
          accion={<button className="btn-secondary" style={BOTON_TARJETA} onClick={() => navigate('/sistemas/herramientas')}>Gestionar</button>}
        >
          {!herramientas ? (
            <SinDatos texto="No se pudo cargar el catálogo de herramientas." />
          ) : topHerramientas.length === 0 ? (
            <SinDatos texto="Todavía no hay herramientas en el catálogo." />
          ) : (
            topHerramientas.map((t) => (
              <BarraH
                key={t.id}
                etiqueta={t.name}
                valor={t._count?.assignments ?? 0}
                max={maxAsignadas}
                color="#6b46c1"
                detalle={`${t._count?.assignments ?? 0} ${(t._count?.assignments ?? 0) === 1 ? 'persona' : 'personas'}`}
              />
            ))
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Novedades de la app"
          hint="Lo último que se avisó a las personas."
          accion={<button className="btn-secondary" style={BOTON_TARJETA} onClick={() => navigate('/sistemas/novedades')}>Publicar</button>}
        >
          {!novedades ? (
            <SinDatos texto="No se pudieron cargar las novedades." />
          ) : novedades.length === 0 ? (
            <SinDatos texto="Todavía no se ha publicado ninguna novedad." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedades.slice(0, 3).map((n) => (
                <div key={n.id} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <span className="truncate" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>{n.titulo}</span>
                  <span style={{ fontSize: '0.72rem', color: '#718096' }}>
                    {fecha(n.createdAt)} · llegó a {n.destinatarios} {n.destinatarios === 1 ? 'persona' : 'personas'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Base de conocimiento"
          hint="Lo que sabe Agente Gemeseg sobre políticas y procesos."
          accion={<button className="btn-secondary" style={BOTON_TARJETA} onClick={() => navigate('/sistemas/base-conocimiento')}>Editar</button>}
        >
          {conocimiento === null ? (
            <SinDatos texto="No se pudo cargar la base de conocimiento." />
          ) : !conocimiento.trim() ? (
            <SinDatos texto="Aún no hay texto: el agente responde sin contexto de la empresa." />
          ) : (
            <>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--azul-oscuro)', lineHeight: 1.2 }}>
                {temas.length} {temas.length === 1 ? 'tema' : 'temas'}
              </div>
              <p style={{ margin: '4px 0 10px', fontSize: '0.78rem', color: '#718096' }}>
                {numero(conocimiento.length)} caracteres de texto.
              </p>
              {temas.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {temas.map((t) => (
                    <span key={t} className="status-badge" style={{ background: '#edf2f7', color: '#2d3748', fontSize: '0.72rem' }}>{t}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
