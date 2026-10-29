import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardClientes, getSalesClient, getSalesClientFields, type DashboardClientes, type SalesClient, type SalesClientField } from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import DashboardCartera from '../../components/ventas/dashboard/DashboardCartera';
import DashboardEmbudo from '../../components/ventas/dashboard/DashboardEmbudo';
import DashboardMotivos from '../../components/ventas/dashboard/DashboardMotivos';
import DashboardEquipo from '../../components/ventas/dashboard/DashboardEquipo';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import PageTabs from '../../components/common/PageTabs';
import FilterField from '../../components/common/FilterField';
import FiltroFecha from '../../components/common/FiltroFecha';
import { rangoDeAtajo, type FiltroFechaValor } from '../../utils/rangoFechas';
import { Tarjeta } from '../../components/ventas/dashboard/DashboardBits';
import { AreaGrafico, BarraApilada, EmbudoGrafico, Medidor } from '../../components/ventas/dashboard/DashboardGraficos';

// El mapa (Leaflet) pesa: se descarga solo al abrir el Resumen.
const DashboardMapa = lazy(() => import('../../components/ventas/dashboard/DashboardMapa'));

// Pestañas del dashboard (2026-10-07). «Resumen» es el tablero de siempre (se
// mira por clientes); las demás salen de las oportunidades, los contratos y los
// motivos de cierre.
type Pestana = 'resumen' | 'cartera' | 'embudo' | 'motivos' | 'equipo';
const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'cartera', label: 'Cartera y contratos' },
  { value: 'embudo', label: 'Embudo de ventas' },
  { value: 'motivos', label: 'Motivos de pérdida' },
  { value: 'equipo', label: 'Equipo' },
];

// ---------- Fechas (siempre en hora local de quien mira) ----------

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatDia = (s: string) => s.split('-').reverse().join('/');
const formatCorto = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

// UN solo periodo para todo el dashboard (2026-10-28), con el mismo selector que el filtro «Fecha» de las listas
// (components/common/FiltroFecha + utils/rangoFechas.ts): así el botón de una tarjeta abre la lista con exactamente
// este periodo. Por defecto, «Este mes». Solo las tarjetas rotuladas «Hoy» ignoran el periodo.
const PERIODO_INICIAL: FiltroFechaValor = { atajo: 'mes', ...rangoDeAtajo('mes') };

const COLOR_VENCIDO = '#c53030';
const COLOR_HOY = '#b7791f';

export default function VentasDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const currentUser = getUser();
  const [data, setData] = useState<DashboardClientes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 'mine' | 'all' | id de un vendedor (solo Admin/Manager)
  const [responsable, setResponsable] = useState('mine');
  const [periodo, setPeriodo] = useState<FiltroFechaValor>(PERIODO_INICIAL);
  // Mientras se editan las fechas sueltas puede faltar una o quedar al revés: se sigue usando el último periodo válido.
  const ultimoValido = useRef({ desde: PERIODO_INICIAL.desde, hasta: PERIODO_INICIAL.hasta });
  if (periodo.desde && periodo.hasta && periodo.desde <= periodo.hasta) {
    ultimoValido.current = { desde: periodo.desde, hasta: periodo.hasta };
  }
  const { desde, hasta } = ultimoValido.current;
  const rango = { desde, hasta };
  // La ficha de un cliente se abre AQUÍ, a la derecha, sin cambiar de pestaña ni de pantalla.
  const [fichaCliente, setFichaCliente] = useState<SalesClient | null>(null);
  const [editarCliente, setEditarCliente] = useState<SalesClient | null>(null);
  const [camposFicha, setCamposFicha] = useState<SalesClientField[] | null>(null);
  const abrirFicha = async (id: number) => {
    try {
      const [cliente, campos] = await Promise.all([getSalesClient(id), camposFicha ?? getSalesClientFields()]);
      setCamposFicha(campos);
      setFichaCliente(cliente);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo abrir la ficha', 'error');
    }
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getDashboardClientes({ desde, hasta, responsable, hoy: iso(new Date()) }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [responsable, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  // Lleva a Oportunidades ya filtrado: el seguimiento, la etapa y el responsable
  // son de las oportunidades, no del Directorio (2026-10-16).
  // El alcance que se está mirando viaja con el filtro («mine» = quien tiene la sesión, «all» = toda la empresa,
  // o el id de otro vendedor): si el tablero cuenta «lo mío», Oportunidades llega filtrado por lo mío.
  const irAOportunidades = (filtros: Record<string, string>) => {
    const params = new URLSearchParams({ ...filtros, responsable });
    navigate(`/ventas/oportunidades${params.toString() ? `?${params.toString()}` : ''}`);
  };
  // Las tarjetas que cuentan por periodo («Nuevos», «Referidos») abren la lista con ESE periodo ya puesto (el
  // filtro «Fecha» de la lista lo muestra y se puede quitar), para que el número y la lista coincidan.
  const irConPeriodo = (ruta: string, filtros: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...filtros, ...rango, responsable });
    navigate(`${ruta}?${params.toString()}`);
  };

  // El embudo y la aceptación cuentan las oportunidades que llegaron en el periodo: su botón abre la lista con ese mismo periodo.
  const irAOportunidadesDelPeriodo = (filtros: Record<string, string>) => irAOportunidades({ ...filtros, ...rango });

  const [pestana, setPestana] = useState<Pestana>('resumen');
  // Si la persona nunca tocó el alcance, al pasar a una pestaña nueva un gerente ve
  // a toda la empresa (la cartera «solo mía» casi nunca es lo que busca).
  const [alcanceTocado, setAlcanceTocado] = useState(false);
  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    if (p !== 'resumen' && !alcanceTocado && (currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER')) {
      setResponsable('all');
    }
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
  // «Mis clientes» sin nada a mi nombre: en vez de mostrar todo en 0 sin explicación, se dice por qué y se ofrece
  // ver a toda la empresa (todos pueden; ver a otra persona es solo de ADMIN y MANAGER).
  const sinNadaMio = responsable === 'mine' && !!data
    && data.embudo.every((e) => e.count === 0) && data.aceptacion.aceptados === 0 && data.aceptacion.rechazados === 0
    && data.nuevos.total === 0 && data.seguimientos.activos === 0;
  // Embudo de etapas: el número de cada franja es lo que hay AHORA en ella; el ancho es el acumulado (las que
  // llegaron a esa etapa o más lejos, contando las aceptadas), así la figura solo se angosta y se lee como embudo.
  const activasEmbudo = (data?.embudo ?? []).filter((e) => !e.isFinal && e.key !== null);
  const sinEtapa = (data?.embudo ?? []).find((e) => e.key === null)?.count ?? 0;
  const aceptadasEmbudo = data?.aceptacion.aceptados ?? 0;
  const pasosEmbudo = activasEmbudo.map((e, i) => {
    const llegaron = activasEmbudo.slice(i).reduce((suma, x) => suma + x.count, 0) + aceptadasEmbudo;
    return { key: e.key ?? 'none', etiqueta: e.label, valor: e.count, ancho: llegaron, color: e.color, nota: `${llegaron} llegaron` };
  });
  const alcanceTodos = data?.alcance.responsable !== 'mine';

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Dashboard comercial"
        description="Cómo van tus clientes y prospectos: qué atender, dónde están y qué se está quedando atrás."
      />

      <PageTabs
        label="Secciones del dashboard" value={pestana} onChange={cambiarPestana}
        tabs={PESTANAS.map((p) => ({ key: p.value, label: p.label }))}
      />

      <div className="dash-barra">
        <FilterField label="Cifras de">
          <select
            className="filter-select" value={responsable}
            onChange={(e) => { setAlcanceTocado(true); setResponsable(e.target.value); }}
            title={esManager ? 'Elige de quién se miran las cifras: tuyas, de toda la empresa o de una persona con acceso a Ventas y CRM' : 'Aquí ves las cifras de tus propios clientes y oportunidades'}
          >
            <option value="mine">Mis clientes y prospectos</option>
            <option value="all">Toda la empresa</option>
            {esManager && (data?.responsables ?? []).some((r) => r.id !== currentUser?.id) && (
              <optgroup label="Una persona con acceso a Ventas y CRM">
                {(data?.responsables ?? [])
                  .filter((r) => r.id !== currentUser?.id)
                  .map((r) => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
              </optgroup>
            )}
          </select>
        </FilterField>
        <FiltroFecha
          label="Periodo" valor={periodo} onChange={setPeriodo} sinVacio etiquetaPersonalizado="Personalizado"
          atajos={['semana', 'mes', 'mes_pasado', '90', 'anio']}
          title="Un solo periodo para todas las pestañas. Las tarjetas marcadas «Hoy» muestran cómo está todo ahora y no lo usan"
        />
        <p className="dash-barra-rango" title="Periodo que están usando todas las pestañas">
          <strong>{formatDia(desde)} – {formatDia(hasta)}</strong>
        </p>
      </div>

      {sinNadaMio && (
        <div className="dash-aviso" role="status">
          <span>
            <strong>No llevas oportunidades a tu nombre</strong>, por eso las cifras de «Mis clientes y prospectos» están en 0.
            Mira cómo va toda la empresa para ver datos.
          </span>
          <button type="button" className="btn-secondary" onClick={() => { setAlcanceTocado(true); setResponsable('all'); }}>
            Ver toda la empresa
          </button>
        </div>
      )}

      {pestana === 'cartera' ? (
        <DashboardCartera alcance={responsable} desde={desde} hasta={hasta} />
      ) : pestana === 'embudo' ? (
        <DashboardEmbudo alcance={responsable} desde={desde} hasta={hasta} />
      ) : pestana === 'motivos' ? (
        <DashboardMotivos alcance={responsable} desde={desde} hasta={hasta} />
      ) : pestana === 'equipo' ? (
        <DashboardEquipo alcance={responsable} desde={desde} hasta={hasta} />
      ) : error ? (
        <div className="dash-card">
          <p style={{ margin: 0, color: '#718096' }}>No se pudo cargar el dashboard.</p>
          <button type="button" className="btn-secondary" onClick={cargar} style={{ marginTop: 10, padding: '8px 16px', fontSize: '0.9rem' }}>Reintentar</button>
        </div>
      ) : loading && !data ? (
        <div className="loading-state">Cargando métricas de ventas...</div>
      ) : data && (
        <div className="dash-pila" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {/* Fila 1: qué atender, aceptación y nuevos */}
          <div className="dash-grid dash-grid--3">
            <Tarjeta hoy titulo="Qué atender" hint="Seguimientos de las oportunidades que siguen abiertas">
              <BarraApilada
                vacio="No hay oportunidades abiertas."
                partes={[
                  { key: 'vencidos', etiqueta: 'Seguimientos vencidos', detalle: 'Su fecha ya pasó', valor: data.seguimientos.vencidos, color: COLOR_VENCIDO, onClick: () => irAOportunidades({ vista: 'hoy' }) },
                  { key: 'hoy', etiqueta: 'Para hoy', detalle: 'Toca atenderlos hoy', valor: data.seguimientos.hoy, color: COLOR_HOY, onClick: () => irAOportunidades({ vista: 'hoy' }) },
                  { key: 'sin', etiqueta: 'Sin siguiente paso', detalle: 'Activas sin fecha de seguimiento', valor: data.seguimientos.sinFecha, color: '#64748b', onClick: () => irAOportunidades({ vista: 'hoy' }) },
                ]}
              />
            </Tarjeta>

            <Tarjeta titulo="Aceptación" hint="De las oportunidades que llegaron en el periodo y ya se cerraron, cuántas se ganaron">
              <Medidor
                valor={data.aceptacion.tasa} color="#2f855a"
                titulo={data.aceptacion.tasa === null ? 'Aún no hay cerradas' : 'de aceptación'}
                aria={`Aceptación: ${data.aceptacion.tasa === null ? 'sin datos' : `${data.aceptacion.tasa}%`}`}
              />
              <div className="dash-cierres" style={{ justifyContent: 'center' }}>
                <button type="button" className="dash-cierre" onClick={() => irAOportunidadesDelPeriodo({ etapa: 'ACEPTADO' })} title="Ver las aceptadas en Oportunidades">
                  <i style={{ background: '#2f855a' }} /><b>{data.aceptacion.aceptados}</b> aceptadas
                </button>
                <button type="button" className="dash-cierre" onClick={() => irAOportunidadesDelPeriodo({ etapa: 'RECHAZADO' })} title="Ver las perdidas en Oportunidades">
                  <i style={{ background: '#94a3b8' }} /><b>{data.aceptacion.rechazados}</b> perdidas
                </button>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Nuevos clientes y prospectos" hint="Empresas y personas que se registraron en el Directorio, por semana"
              accion={<button type="button" className="btn-secondary" onClick={() => irConPeriodo('/ventas/clientes')} style={{ padding: '4px 10px', fontSize: '0.78rem' }} title="Ver en el Directorio a quienes se registraron en este periodo">Ver →</button>}
            >
              <div className="dash-cifra">
                <strong>{data.nuevos.total}</strong>
                <span>{data.nuevos.total === 1 ? 'registrado' : 'registrados'} en el Directorio</span>
              </div>
              <AreaGrafico
                puntos={data.nuevos.porSemana.map((s) => ({ etiqueta: formatCorto(s.inicio), valor: s.total }))}
                aria={`Nuevos por semana: ${data.nuevos.porSemana.map((s) => `${formatCorto(s.inicio)} ${s.total}`).join(', ')}`}
              />
            </Tarjeta>
          </div>

          {/* Fila 2: el embudo y lo que se está quedando atrás */}
          <div className="dash-grid dash-grid--3">
            <Tarjeta className="dash-span2" titulo="Oportunidades por etapa" hint="De las oportunidades que llegaron en el periodo: el número es cuántas están hoy en cada etapa; el ancho, cuántas han llegado hasta ahí o más lejos. Pulsa una etapa para verla en Oportunidades">
              <EmbudoGrafico
                aria={`Por etapa: ${activasEmbudo.map((e) => `${e.label} ${e.count}`).join(', ')}`}
                pasos={pasosEmbudo}
                onPaso={(key) => irAOportunidadesDelPeriodo({ etapa: key })}
              />
              <div className="dash-cierres">
                {sinEtapa > 0 && (
                  <button type="button" className="dash-cierre" onClick={() => irAOportunidadesDelPeriodo({ etapa: 'none' })} title="Ver en Oportunidades">
                    <i style={{ background: '#cbd5e1' }} /><b>{sinEtapa}</b> sin etapa
                  </button>
                )}
                {data.embudo.filter((e) => e.isFinal).map((e) => (
                  <button key={e.key ?? 'final'} type="button" className="dash-cierre" onClick={() => irAOportunidadesDelPeriodo({ etapa: e.key ?? 'none' })} title="Ver en Oportunidades">
                    <i style={{ background: e.color }} /><b>{e.count}</b> {e.label.toLowerCase()}
                  </button>
                ))}
              </div>
            </Tarjeta>

            <Tarjeta
              hoy
              titulo="Estancados"
              hint={`Más de ${data.estancados.dias} días en la misma etapa (aproximado: el historial de etapas se guarda desde el 30/09/2026)`}
            >
              {data.estancados.lista.length === 0 ? (
                <p style={{ margin: 0, color: '#718096', fontSize: '0.88rem' }}>Ninguno lleva tanto tiempo en la misma etapa.</p>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {data.estancados.lista.slice(0, 5).map((c) => (
                      <li key={c.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <button
                          type="button"
                          onClick={() => abrirFicha(c.id)}
                          title="Abrir la ficha"
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
                  {data.estancados.total > 5 && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#a0aec0' }}>
                      Se muestran los 5 más antiguos de {data.estancados.total}.
                    </p>
                  )}
                </>
              )}
            </Tarjeta>
          </div>

          {/* Fila 3: dónde se cotiza, documentos y referidos */}
          <div className="dash-grid dash-grid--3">
            <Suspense fallback={null}>
              <DashboardMapa alcance={responsable} desde={desde} hasta={hasta} className="dash-span2" />
            </Suspense>

            <div className="dash-pila">
              <Tarjeta titulo="Documentos de estos clientes" hint="Documentos creados en el periodo y cómo están hoy">
                <BarraApilada
                  vacio="Todavía no hay documentos."
                  partes={[
                    { key: 'borrador', etiqueta: 'En borrador', valor: data.contratos.borrador, color: '#94a3b8' },
                    { key: 'firma', etiqueta: 'En firma', valor: data.contratos.enFirma, color: '#2b6cb0' },
                    { key: 'firmados', etiqueta: 'Firmados', valor: data.contratos.firmados, color: '#2f855a' },
                  ]}
                />
                {data.contratos.aceptadosSinContrato > 0 && (
                  <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: COLOR_HOY }}>
                    {data.contratos.aceptadosSinContrato} {data.contratos.aceptadosSinContrato === 1 ? 'cliente aceptado' : 'clientes aceptados'} aún sin documento.
                  </p>
                )}
                {alcanceTodos && data.contratos.sinClienteVinculado > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#a0aec0' }}>
                    Además hay {data.contratos.sinClienteVinculado} documentos que no están vinculados a ningún cliente y no se cuentan arriba.
                  </p>
                )}
              </Tarjeta>

              <Tarjeta
                titulo="Referidos"
                hint="Oportunidades de origen «Referido» que llegaron en el periodo"
                accion={<button type="button" className="btn-secondary" onClick={() => irConPeriodo('/ventas/oportunidades', { origen: 'REFERIDO' })} style={{ padding: '4px 10px', fontSize: '0.78rem' }} title="Ver las oportunidades que vinieron por referido en este periodo">Ver →</button>}
              >
                <BarraApilada
                  vacio="Aún no hay referidos en este periodo."
                  partes={[
                    { key: 'curso', etiqueta: 'En curso', valor: data.referidos.enCurso, color: '#2b6cb0' },
                    { key: 'ace', etiqueta: 'Aceptados', valor: data.referidos.aceptados, color: '#2f855a' },
                    { key: 'per', etiqueta: 'Perdidos', valor: data.referidos.rechazados, color: '#94a3b8' },
                  ]}
                />
                {data.referidos.top.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Quién más refiere</div>
                    {data.referidos.top.map((t) => (
                      <div key={t.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span>{t.nombre}</span><strong>{t.total}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </Tarjeta>
            </div>
          </div>

          {/* Por responsable (solo cuando se mira más de uno) */}
          {alcanceTodos && (
            <Tarjeta titulo="Oportunidades por responsable" hint="De las oportunidades que llegaron en el periodo: quién lleva cuántas abiertas (Activos), a cuántas se les venció el seguimiento (Vencidos, un estado de hoy) y cuántas ganó (Aceptados). Las que no tienen responsable están en la primera fila">
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
          )}
        </div>
      )}

      {fichaCliente && camposFicha && (
        <ClienteFichaPanel
          client={fichaCliente}
          fields={camposFicha}
          onClose={() => setFichaCliente(null)}
          onEdit={(cliente) => { setFichaCliente(null); setEditarCliente(cliente); }}
        />
      )}
      {editarCliente && camposFicha && (
        <ClienteFormModal
          client={editarCliente}
          fields={camposFicha}
          onClose={() => setEditarCliente(null)}
          onSaved={() => { setEditarCliente(null); cargar(); }}
        />
      )}
    </div>
  );
}
