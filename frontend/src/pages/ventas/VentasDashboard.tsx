import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardClientes, DashboardClientes } from '../../services/ventas.service';
import { getUser } from '../../services/auth.service';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useResizableColumns } from '../../hooks/useResizableColumns';

// ---------- Fechas (siempre en hora local de quien mira) ----------

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatDia = (s: string) => s.split('-').reverse().join('/');
const formatCorto = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

type Rango = 'semana' | 'mes' | 'mes_pasado' | '90';
const RANGOS: { value: Rango; label: string }[] = [
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: '90', label: 'Últimos 90 días' },
];

function rangoFechas(r: Rango): { desde: string; hasta: string } {
  const hoy = new Date();
  if (r === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return { desde: iso(lunes), hasta: iso(hoy) };
  }
  if (r === 'mes_pasado') {
    return {
      desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    };
  }
  if (r === '90') {
    const ini = new Date(hoy);
    ini.setDate(hoy.getDate() - 89);
    return { desde: iso(ini), hasta: iso(hoy) };
  }
  return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
}

const COLOR_VENCIDO = '#c53030';
const COLOR_HOY = '#b7791f';

function Tarjeta({ titulo, hint, children, accion }: { titulo: string; hint?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="admin-section" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--azul-oscuro)', fontSize: '1rem' }}>{titulo}</h3>
          {hint && <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: 2 }}>{hint}</div>}
        </div>
        {accion}
      </div>
      {children}
    </div>
  );
}

function Contador({ titulo, valor, color, detalle, onClick }: { titulo: string; valor: number | string; color: string; detalle: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="admin-section"
      style={{
        borderLeft: `4px solid ${color}`, padding: 16, textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
        font: 'inherit', width: '100%', margin: 0,
      }}
    >
      <div style={{ fontSize: '0.8rem', color: '#718096', fontWeight: 600, textTransform: 'uppercase' }}>{titulo}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
      <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: 4 }}>{detalle}</div>
    </button>
  );
}

export default function VentasDashboard() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const [data, setData] = useState<DashboardClientes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 'mine' | 'all' | id de un vendedor (solo Admin/Manager)
  const [responsable, setResponsable] = useState('mine');
  const [rango, setRango] = useState<Rango>('mes');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getDashboardClientes({ ...rangoFechas(rango), responsable, hoy: iso(new Date()) }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [responsable, rango]);

  useEffect(() => { cargar(); }, [cargar]);

  // Lleva a Clientes ya filtrado, conservando el alcance elegido aquí.
  const irAClientes = (filtros: Record<string, string>) => {
    const params = new URLSearchParams({ responsable: data?.alcance.responsable ?? responsable, ...filtros });
    navigate(`/ventas/clientes?${params.toString()}`);
  };

  const filasResp = data?.porResponsable ?? [];
  const { filas: respOrdenadas, thProps, SortIcon } = useSortableTable(
    filasResp,
    {
      nombre: (r) => r.nombre,
      activos: (r) => r.activos,
      vencidos: (r) => r.vencidos,
      aceptados: (r) => r.aceptados,
    },
  );
  const tablaRespRef = useResizableColumns('ventas-dashboard-responsables', ['nombre', 'activos', 'vencidos', 'aceptados']);

  const esManager = !!data?.alcance.esManager;
  const alcanceTodos = data?.alcance.responsable !== 'mine';
  const maxEmbudo = Math.max(1, ...(data?.embudo.map((e) => e.count) ?? [1]));
  const maxSemana = Math.max(1, ...(data?.nuevos.porSemana.map((s) => s.total) ?? [1]));

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Dashboard comercial</h1>
          <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 4 }}>
            Cómo van tus clientes: qué atender, dónde están y qué se está quedando atrás.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <select className="filter-select" value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Alcance">
            <option value="mine">Mis clientes</option>
            <option value="all">Toda la empresa</option>
            {esManager && (data?.responsables ?? [])
              .filter((r) => r.id !== currentUser?.id)
              .map((r) => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
          </select>
          <select className="filter-select" value={rango} onChange={(e) => setRango(e.target.value as Rango)} aria-label="Rango de fechas">
            {RANGOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <span style={{ fontSize: '0.75rem', color: '#a0aec0', alignSelf: 'center' }}>
            El rango solo afecta a "Nuevos clientes" y "Referidos"; lo demás es cómo está todo hoy.
          </span>
        </div>
      </div>

      {error ? (
        <div className="admin-section" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: '#718096' }}>No se pudo cargar el dashboard.</p>
          <button type="button" className="btn-secondary" onClick={cargar} style={{ marginTop: 10, padding: '8px 16px', fontSize: '0.9rem' }}>Reintentar</button>
        </div>
      ) : loading && !data ? (
        <div className="loading-state">Cargando métricas de ventas...</div>
      ) : data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {/* Qué se está cayendo / aceptación */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginTop: 16 }}>
            <Contador titulo="Seguimientos vencidos" valor={data.seguimientos.vencidos} color={COLOR_VENCIDO}
              detalle={data.seguimientos.vencidos ? 'Su fecha ya pasó. Ver los clientes →' : 'Sin pendientes atrasados'}
              onClick={data.seguimientos.vencidos ? () => irAClientes({ seguimiento: 'vencido' }) : undefined} />
            <Contador titulo="Para hoy" valor={data.seguimientos.hoy} color={COLOR_HOY}
              detalle={data.seguimientos.hoy ? 'Toca atenderlos hoy. Ver los clientes →' : 'Nada programado para hoy'}
              onClick={data.seguimientos.hoy ? () => irAClientes({ seguimiento: 'hoy' }) : undefined} />
            <Contador titulo="Sin siguiente paso" valor={data.seguimientos.sinFecha} color="#718096"
              detalle={data.seguimientos.sinFecha ? 'Activos sin fecha de seguimiento →' : 'Todos tienen siguiente paso'}
              onClick={data.seguimientos.sinFecha ? () => irAClientes({ seguimiento: 'sin' }) : undefined} />
            <Contador titulo="Aceptación" valor={data.aceptacion.tasa === null ? '—' : `${data.aceptacion.tasa}%`} color="#2f855a"
              detalle={data.aceptacion.tasa === null
                ? 'Aún no hay clientes aceptados ni rechazados'
                : `${data.aceptacion.aceptados} aceptados · ${data.aceptacion.rechazados} rechazados`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
            {/* Embudo */}
            <Tarjeta titulo="Clientes por etapa" hint="Con las etapas que tiene configuradas la empresa">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.embudo.map((e) => (
                  <button
                    key={e.key ?? 'sin-etapa'}
                    type="button"
                    onClick={() => irAClientes({ etapa: e.key ?? 'none' })}
                    title="Ver estos clientes"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{e.label}{e.isFinal ? ' (final)' : ''}</span>
                      <span style={{ fontWeight: 800, color: e.color }}>{e.count}</span>
                    </div>
                    <div style={{ background: '#edf2f7', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(e.count / maxEmbudo) * 100}%`, height: '100%', background: e.color, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </button>
                ))}
              </div>
            </Tarjeta>

            {/* Estancados */}
            <Tarjeta
              titulo="Clientes estancados"
              hint={`Más de ${data.estancados.dias} días en la misma etapa (aproximado: el historial de etapas se guarda desde el 30/09/2026)`}
            >
              {data.estancados.lista.length === 0 ? (
                <p style={{ margin: 0, color: '#718096', fontSize: '0.88rem' }}>Ningún cliente lleva tanto tiempo en la misma etapa.</p>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {data.estancados.lista.map((c) => (
                      <li key={c.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/ventas/clientes?ficha=${c.id}`)}
                          title="Abrir la ficha del cliente"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="truncate" style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--azul-oscuro)' }}>{c.name}</span>
                            <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{c.responsable || 'Sin responsable'}</span>
                          </span>
                          <span className="status-badge" style={{ backgroundColor: c.color + '22', color: c.color, whiteSpace: 'nowrap' }}>{c.etapa}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: COLOR_VENCIDO, whiteSpace: 'nowrap' }}>{c.dias} d</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {data.estancados.total > data.estancados.lista.length && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#a0aec0' }}>
                      Se muestran los {data.estancados.lista.length} más antiguos de {data.estancados.total}.
                    </p>
                  )}
                </>
              )}
            </Tarjeta>

            {/* Nuevos clientes */}
            <Tarjeta titulo="Nuevos clientes" hint={`Del ${formatDia(data.alcance.desde)} al ${formatDia(data.alcance.hasta)}`}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#2b6cb0' }}>{data.nuevos.total}</span>
                <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                  {data.nuevos.referidos} {data.nuevos.referidos === 1 ? 'vino' : 'vinieron'} por referido
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
                {data.nuevos.porSemana.map((s) => (
                  <div key={s.inicio} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
                    title={`Semana del ${formatDia(s.inicio)}: ${s.total}`}>
                    <span style={{ fontSize: '0.7rem', color: '#718096' }}>{s.total || ''}</span>
                    <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(2, (s.total / maxSemana) * 62)}px`, background: s.total ? '#2b6cb0' : '#e2e8f0', borderRadius: 3 }} />
                    <span style={{ fontSize: '0.65rem', color: '#a0aec0', marginTop: 2 }}>{formatCorto(s.inicio)}</span>
                  </div>
                ))}
              </div>
            </Tarjeta>

            {/* Referidos */}
            <Tarjeta
              titulo="Referidos"
              hint={`Recibidos entre el ${formatDia(data.alcance.desde)} y el ${formatDia(data.alcance.hasta)}`}
              accion={
                <button type="button" className="btn-secondary" onClick={() => irAClientes({ referido: '1' })} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                  Ver →
                </button>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                {[
                  { n: data.referidos.recibidos, t: 'Recibidos', c: '#2b6cb0' },
                  { n: data.referidos.sinAtender, t: 'Sin atender', c: data.referidos.sinAtender ? COLOR_HOY : '#718096' },
                  { n: data.referidos.aceptados, t: 'Aceptados', c: '#2f855a' },
                  { n: data.referidos.rechazados, t: 'Rechazados', c: '#718096' },
                ].map((x) => (
                  <div key={x.t}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: x.c }}>{x.n}</div>
                    <div style={{ fontSize: '0.72rem', color: '#718096' }}>{x.t}</div>
                  </div>
                ))}
              </div>
              {data.referidos.top.length > 0 && (
                <div style={{ marginTop: 12, fontSize: '0.82rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#a0aec0', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Quién más refiere</div>
                  {data.referidos.top.map((t) => (
                    <div key={t.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{t.nombre}</span><strong>{t.total}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Tarjeta>

            {/* Contratos */}
            <Tarjeta titulo="Contratos de estos clientes" hint="Cómo están ahora">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                {[
                  { n: data.contratos.borrador, t: 'En borrador', c: '#718096' },
                  { n: data.contratos.enFirma, t: 'En firma', c: '#2b6cb0' },
                  { n: data.contratos.firmados, t: 'Firmados', c: '#2f855a' },
                ].map((x) => (
                  <div key={x.t}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: x.c }}>{x.n}</div>
                    <div style={{ fontSize: '0.72rem', color: '#718096' }}>{x.t}</div>
                  </div>
                ))}
              </div>
              {data.contratos.aceptadosSinContrato > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: COLOR_HOY }}>
                  {data.contratos.aceptadosSinContrato} {data.contratos.aceptadosSinContrato === 1 ? 'cliente aceptado' : 'clientes aceptados'} aún sin contrato.
                </p>
              )}
              {alcanceTodos && data.contratos.sinClienteVinculado > 0 && (
                <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#a0aec0' }}>
                  Además hay {data.contratos.sinClienteVinculado} contratos que no están vinculados a ningún cliente y no se cuentan arriba.
                </p>
              )}
            </Tarjeta>
          </div>

          {/* Por responsable (solo cuando se mira más de uno) */}
          {alcanceTodos && (
            <div style={{ marginTop: 20 }}>
              <Tarjeta titulo="Clientes por responsable" hint="Quién lleva cuántos clientes activos y qué se le está atrasando">
                <div className="tasks-table-wrapper">
                  <table className="tasks-table resizable-table" ref={tablaRespRef}>
                    <thead>
                      <tr>
                        <th {...thProps('nombre')}>Responsable <SortIcon campo="nombre" /></th>
                        <th {...thProps('activos')}>Activos <SortIcon campo="activos" /></th>
                        <th {...thProps('vencidos')}>Vencidos <SortIcon campo="vencidos" /></th>
                        <th {...thProps('aceptados')}>Aceptados <SortIcon campo="aceptados" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {respOrdenadas.map((r) => (
                        <tr key={r.userId ?? 'sin'}>
                          <td style={{ fontWeight: 600 }}>
                            {r.userId === null ? <span style={{ color: COLOR_HOY }}>Sin responsable</span> : r.nombre}
                          </td>
                          <td>{r.activos}</td>
                          <td style={{ color: r.vencidos ? COLOR_VENCIDO : undefined, fontWeight: r.vencidos ? 700 : undefined }}>{r.vencidos}</td>
                          <td>{r.aceptados}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
